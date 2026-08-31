function splitPatterns(rawPatterns) {
  const raw = String(rawPatterns ?? '');
  const chunks = /\r?\n\s*\r?\n/.test(raw)
    ? raw.split(/\r?\n\s*\r?\n/)
    : raw.split(/\r?\n/);
  return [...new Set(chunks.map((item) => item.trim()).filter(Boolean))];
}

export function previewClean(sourceText, rawPatterns) {
  const source = String(sourceText ?? '');
  const patterns = splitPatterns(rawPatterns);
  const hits = [];
  for (const pattern of patterns) {
    let from = 0;
    let count = 0;
    while (from <= source.length) {
      const index = source.indexOf(pattern, from);
      if (index < 0) break;
      hits.push({ pattern, index, end: index + pattern.length, preview: source.slice(Math.max(0, index - 40), Math.min(source.length, index + pattern.length + 40)) });
      count += 1;
      from = index + Math.max(1, pattern.length);
    }
  }
  return { previewId: `clean_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, sourceHash: hashText(source), patterns, hits, count: hits.length };
}

export function applyClean(sourceText, preview) {
  const source = String(sourceText ?? '');
  if (!preview || preview.sourceHash !== hashText(source)) throw new Error('原文已变化，请重新预览清洗命中');
  let next = source;
  const sorted = [...preview.hits].sort((a, b) => b.index - a.index);
  for (const hit of sorted) next = next.slice(0, hit.index) + next.slice(hit.end);
  return { text: next, deletedCount: sorted.length, before: source, after: next };
}

export function removeImpurities(sourceText, chapterRegex) {
  const source = String(sourceText ?? '');
  const re = new RegExp(chapterRegex, 'gmu');
  const matches = [...source.matchAll(re)];
  if (!matches.length) return { text: source, removed: [], pending: ['未找到章节标题，无法安全判断正文范围'] };
  const firstStart = matches[0].index ?? 0;
  const removed = [];
  const prefix = source.slice(0, firstStart);
  if (prefix.trim()) removed.push({ reason: '章节前内容', text: prefix });
  const marker = /(?:本章完|全文完|作者(?:按|注|的话)|更新时间|修改时间|责任编辑|推荐票|收藏本站|请收藏|免责声明)/;
  const lines = source.slice(firstStart).split(/\r?\n/);
  const kept = [];
  const pending = [];
  for (const line of lines) {
    if (marker.test(line.trim())) {
      removed.push({ reason: '疑似杂质标记', text: line });
      continue;
    }
    if (/^\s*(?:作者|注：|备注|修改说明)/.test(line.trim())) { pending.push(line); kept.push(line); }
    else kept.push(line);
  }
  return { text: kept.join('\n'), removed, pending };
}

export function hashText(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
