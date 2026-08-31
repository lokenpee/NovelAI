import { clone } from '../constants.js';

function ensureUniqueName(chapters, id, name) {
  const normalized = String(name ?? '').trim();
  if (!normalized) throw new Error('章节名称不能为空');
  const conflict = chapters.find((chapter) => chapter.chapterId !== id && chapter.chapterName === normalized);
  if (conflict) throw new Error(`章节名称与「${conflict.chapterName}」重复`);
  return normalized;
}

export function updateChapter(chapters, chapterId, changes) {
  const next = clone(chapters);
  const index = next.findIndex((chapter) => chapter.chapterId === chapterId);
  if (index < 0) throw new Error(`章节不存在: ${chapterId}`);
  const chapter = next[index];
  const name = ensureUniqueName(next, chapterId, changes.chapterName ?? chapter.chapterName);
  chapter.chapterName = name;
  chapter.text = String(changes.text ?? chapter.text);
  chapter.charCount = chapter.text.length;
  chapter.sourceVersion = (chapter.sourceVersion || 1) + 1;
  chapter.status = 'needs_review';
  chapter.confirmed = false;
  return next;
}

export function deleteChapters(chapters, ids) {
  const set = new Set(ids);
  return chapters.filter((chapter) => !set.has(chapter.chapterId)).map((chapter, order) => ({ ...chapter, order }));
}

export function mergeAdjacentChapter(chapters, chapterId, direction = 'next') {
  const next = clone(chapters);
  const index = next.findIndex((chapter) => chapter.chapterId === chapterId);
  const otherIndex = direction === 'previous' ? index - 1 : index + 1;
  if (index < 0 || otherIndex < 0 || otherIndex >= next.length) throw new Error('没有可合并的相邻章节');
  const keepIndex = direction === 'previous' ? otherIndex : index;
  const removeIndex = direction === 'previous' ? index : otherIndex;
  const keep = next[keepIndex];
  const remove = next[removeIndex];
  keep.text = `${keep.text.trim()}\n\n${remove.text.trim()}`.trim();
  keep.charCount = keep.text.length;
  keep.sourceVersion = (keep.sourceVersion || 1) + 1;
  keep.status = 'needs_review';
  next.splice(removeIndex, 1);
  return next.map((chapter, order) => ({ ...chapter, order }));
}
