const FIELD_ALIASES = new Map([
  ['姓名', '名称'], ['人物名称', '名称'], ['角色名称', '名称'], ['名字', '名称'], ['真实姓名', '名称'], ['真实地名', '名称'],
  ['外形', '外貌'], ['形象', '外貌'], ['经历', '背景故事'], ['履历', '背景故事'], ['过往', '背景故事']
]);

export function normalizeName(value) {
  return String(value ?? '')
    .replace(/[（）()[\]【】{}<>《》]/g, '')
    .replace(/^第?[一二三四五六七八九十百千万0-9]+卷\s*/u, '')
    .replace(/(?:第?[一二三四五六七八九十百千万0-9]+卷|第?[一二三四五六七八九十百千万0-9]+章)\s*$/u, '')
    .replace(/(?:新版|重制版|修订版|卷[一二三四五六七八九十百千万0-9]+)\s*$/u, '')
    .replace(/[\s\u3000·•、，,。！？!?：:；;“”"'‘’（）()[\]【】{}<>《》]/g, '')
    .trim();
}

export function normalizeFieldName(value) {
  const raw = String(value ?? '').trim().replace(/[*_`]/g, '');
  return FIELD_ALIASES.get(raw) || raw;
}

export function sanitizeKeywords(value, fallback = '') {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[、,，\n]/);
  const result = [];
  for (const item of values) {
    const text = String(item).trim();
    if (text && text.length <= 50 && !result.includes(text)) result.push(text);
  }
  if (!result.length && fallback) result.push(String(fallback).trim());
  return result.slice(0, 5);
}

export function sanitizeMarkdown(content, fields = []) {
  if (content && typeof content === 'object') return Object.entries(content).map(([key, value]) => `**${key}**: ${value}`).join('\n');
  const text = String(content ?? '').trim();
  if (!text || !fields?.length) return text;
  const allowed = new Set(fields.map(normalizeFieldName));
  const lines = text.split(/\r?\n/);
  const output = [];
  let keep = false;
  let structured = false;
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?([^:*\n]{1,40})(?:\*\*)?\s*[:：](.*)$/u);
    if (match) {
      structured = true;
      keep = allowed.has(normalizeFieldName(match[1]));
      if (keep) output.push(line.trim());
    } else if (keep) output.push(line);
  }
  return structured && output.length ? output.join('\n').trim() : text;
}

export function normalizeEntry(raw, categoryConfig, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const name = String(options.name || source.name || source.名称 || source.真实姓名 || source.真实地名 || '').trim();
  if (!name) throw new Error('世界书条目缺少名称');
  const config = categoryConfig || { name: options.category || '未分类', fields: [] };
  const content = sanitizeMarkdown(source.内容 ?? source.content ?? '', config.fields);
  const keywords = sanitizeKeywords(source.关键词 ?? source.keywords, name);
  return {
    id: options.id || `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    category: config.name,
    name,
    normalizedName: normalizeName(name),
    keywords,
    content,
    constant: options.constant ?? config.defaultConfig?.constant ?? false,
    position: options.position || config.defaultConfig?.position || 'before_char',
    depth: Number.isInteger(options.depth) ? options.depth : (config.defaultConfig?.depth ?? 4),
    order: Number.isInteger(options.order) ? options.order : (config.defaultConfig?.order ?? 100),
    sourceChapterIds: [...new Set(options.sourceChapterIds || [])],
    updatedAt: Date.now()
  };
}
