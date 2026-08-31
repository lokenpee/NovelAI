import { PROCESS_STATUS } from '../constants.js';

export function captureChapters(sourceText, pattern, sourceVersion = 1) {
  const source = String(sourceText ?? '');
  let regex;
  try { regex = new RegExp(String(pattern), 'gmu'); } catch (error) { throw new Error(`章节正则无效: ${error.message}`); }
  const matches = [...source.matchAll(regex)];
  const names = matches.map((match) => String(match[0]).trim());
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) return { chapters: [], matches: names, errors: [`章节名称重复: ${duplicate}`] };
  if (matches.length < 2) return { chapters: [], matches: names, errors: [matches.length ? '只匹配到一个章节标题' : '未匹配到章节标题'] };
  const chapters = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    const text = source.slice(start, end).trim();
    return {
      chapterId: index + 1,
      order: index,
      chapterName: names[index],
      text,
      charCount: text.length,
      sourceVersion,
      status: PROCESS_STATUS.PENDING,
      confirmed: true
    };
  });
  const empty = chapters.find((chapter) => !chapter.text);
  if (empty) return { chapters: [], matches: names, errors: [`章节为空: ${empty.chapterName}`] };
  return { chapters, matches: names.slice(0, 10), errors: [] };
}
