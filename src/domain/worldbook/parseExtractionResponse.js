import { normalizeEntry } from './normalizeEntry.js';

function stripCodeFence(text) {
  return String(text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function findJsonObject(text) {
  const source = stripCodeFence(text);
  let start = source.indexOf('{');
  while (start >= 0) {
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      if (char === '}') { depth -= 1; if (depth === 0) return source.slice(start, index + 1); }
    }
    start = source.indexOf('{', start + 1);
  }
  return null;
}

export function parseExtractionResponse(text, categoryConfigs, chapterId) {
  const json = findJsonObject(text);
  if (!json) throw new Error('模型响应中未找到 JSON 对象');
  let parsed;
  try { parsed = JSON.parse(json); } catch (error) { throw new Error(`世界书 JSON 解析失败: ${error.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('世界书结果必须是对象');
  const byName = new Map((categoryConfigs || []).map((category) => [category.name, category]));
  const result = [];
  for (const [categoryName, values] of Object.entries(parsed)) {
    const config = byName.get(categoryName);
    if (!config || !config.enabled || !values || typeof values !== 'object' || Array.isArray(values)) continue;
    for (const [name, value] of Object.entries(values)) {
      if (!value || typeof value !== 'object') continue;
      try { result.push(normalizeEntry(value, config, { name, sourceChapterIds: [chapterId] })); } catch { /* ignore malformed item */ }
    }
  }
  return result;
}
