import { escapeHtml, formatCount } from '../../utils/html.js';

function statusText(chapter) {
  if (chapter.status === 'running') return '🔄 处理中';
  if (chapter.status === 'failed') return '❌ 处理失败';
  if (chapter.confirmed) return '✅ 已确认';
  return '⏳ 待确认';
}

function renderChapterCard(chapter, index, { multiSelect = false, selected = false } = {}) {
  const charCount = Number.isFinite(chapter.charCount) ? chapter.charCount : String(chapter.text || '').length;
  const preview = String(chapter.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const selectedMark = multiSelect ? `<input type="checkbox" data-select-chapter="${chapter.chapterId}" ${selected ? 'checked' : ''} aria-label="选择 ${escapeHtml(chapter.chapterName)}">` : '';
  return `<article class="nai-chapter-card nai-chapter-list-item ${selected ? 'is-selected' : ''}" data-chapter-id="${chapter.chapterId}"><div class="nai-chapter-list-leading">${selectedMark}<span class="nai-chapter-status">${statusText(chapter)}</span></div><button class="nai-chapter-list-main" data-action="open-chapter-dialog" data-id="${chapter.chapterId}" title="点击查看、编辑、复制或合并本章"><strong><em>#${index + 1}</em>${escapeHtml(chapter.chapterName)}<span class="nai-chevron" aria-hidden="true">▸</span></strong><span>${formatCount(charCount)} 字 · ${escapeHtml(preview)}${String(chapter.text || '').length > 90 ? '…' : ''}</span></button>${chapter.confirmed ? '' : `<button class="nai-btn nai-btn-small nai-btn-primary" data-action="confirm-chapter" data-id="${chapter.chapterId}">确认</button>`}</article>`;
}

export function renderChapterQueue(chapters = [], { multiSelect = false, selectedChapterIds = new Set() } = {}) {
  const confirmedCount = chapters.filter((item) => item.confirmed).length;
  const selectedCount = selectedChapterIds.size;
  const summary = `<div class="nai-queue-summary"><div class="nai-queue-summary-stats"><strong>共 ${formatCount(chapters.length)} 章</strong><span>${formatCount(confirmedCount)} 章已确认</span><span>${multiSelect ? `已选择 ${formatCount(selectedCount)} 章` : '点击章节可查看、编辑、复制或合并原文'}</span></div><div class="nai-queue-summary-actions">${multiSelect ? `<button class="nai-btn nai-btn-small" data-action="clear-selected-chapters">取消选择</button><button class="nai-btn nai-btn-small nai-btn-danger" data-action="delete-selected-chapters" ${selectedCount ? '' : 'disabled'}>🗑️ 删除已选</button>` : `<button class="nai-btn nai-btn-small" data-action="toggle-chapter-select-mode" ${chapters.length ? '' : 'disabled'}>🗑️ 多选删除</button>`}</div></div>`;
  const cards = chapters.length
    ? chapters.map((chapter, index) => renderChapterCard(chapter, index, { multiSelect, selected: selectedChapterIds.has(chapter.chapterId) })).join('')
    : '<div class="nai-empty">导入 TXT 并检测章节后，这里会显示章节队列</div>';
  return `${summary}<div class="nai-chapter-queue">${cards}</div>`;
}
