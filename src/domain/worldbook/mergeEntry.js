import { normalizeName, sanitizeKeywords } from './normalizeEntry.js';

function mergeContent(existing, incoming) {
  const lines = [...String(existing || '').split(/\r?\n/), ...String(incoming || '').split(/\r?\n/)];
  const seen = new Set();
  return lines.map((line) => line.trim()).filter((line) => {
    if (!line || seen.has(line)) return false;
    seen.add(line);
    return true;
  }).join('\n');
}

export function mergeEntry(entries, incoming) {
  const next = structuredClone(entries || []);
  const key = `${incoming.category}::${normalizeName(incoming.name)}`;
  const index = next.findIndex((entry) => `${entry.category}::${entry.normalizedName || normalizeName(entry.name)}` === key);
  if (index < 0) { next.push({ ...incoming, normalizedName: normalizeName(incoming.name) }); return next; }
  const current = next[index];
  current.keywords = sanitizeKeywords([...(current.keywords || []), ...(incoming.keywords || [])], current.name);
  current.content = mergeContent(current.content, incoming.content);
  current.sourceChapterIds = [...new Set([...(current.sourceChapterIds || []), ...(incoming.sourceChapterIds || [])])];
  current.updatedAt = Date.now();
  return next;
}

export function mergeEntries(entries, incomingEntries) {
  return (incomingEntries || []).reduce((acc, entry) => mergeEntry(acc, entry), entries || []);
}

export function mergeSelectedEntries(entries, ids, options = {}) {
  const selected = entries.filter((entry) => ids.includes(entry.id));
  if (selected.length < 2) throw new Error('至少选择两个条目进行合并');
  const first = selected[0];
  const name = options.name?.trim() || first.name;
  const category = options.category || (selected.every((entry) => entry.category === first.category) ? first.category : first.category);
  const merged = {
    ...first,
    id: `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    normalizedName: normalizeName(name),
    category,
    keywords: sanitizeKeywords(selected.flatMap((entry) => entry.keywords || []), name),
    content: selected.map((entry) => entry.content).filter(Boolean).join('\n'),
    sourceChapterIds: [...new Set(selected.flatMap((entry) => entry.sourceChapterIds || []))],
    updatedAt: Date.now()
  };
  return [...entries.filter((entry) => !ids.includes(entry.id)), merged];
}
