import { POSITIONS, SCHEMA_VERSION } from '../constants.js';

export function validateProject(project) {
  const errors = [];
  if (!project || typeof project !== 'object') return ['项目必须是对象'];
  if (project.schemaVersion !== SCHEMA_VERSION) errors.push(`不支持的数据格式版本: ${project.schemaVersion}`);
  if (!project.projectId) errors.push('缺少 projectId');
  if (!Array.isArray(project.chapters)) errors.push('chapters 必须是数组');
  if (!Array.isArray(project.worldbookEntries)) errors.push('worldbookEntries 必须是数组');
  if (!Array.isArray(project.beatAssets)) errors.push('beatAssets 必须是数组');
  const ids = new Set();
  const names = new Set();
  for (const chapter of project.chapters || []) {
    if (!Number.isInteger(chapter.chapterId) || chapter.chapterId <= 0) errors.push(`章节编号无效: ${chapter.chapterId}`);
    if (ids.has(chapter.chapterId)) errors.push(`章节编号重复: ${chapter.chapterId}`);
    ids.add(chapter.chapterId);
    if (!chapter.chapterName) errors.push(`章节 ${chapter.chapterId} 缺少名称`);
    if (names.has(chapter.chapterName)) errors.push(`章节名称重复: ${chapter.chapterName}`);
    names.add(chapter.chapterName);
  }
  const categoryNames = new Set((project.categoryConfigs || []).map((c) => c.name));
  const entryIds = new Set();
  for (const entry of project.worldbookEntries || []) {
    if (!entry.id || entryIds.has(entry.id)) errors.push(`世界书条目 ID 重复或缺失: ${entry.id}`);
    entryIds.add(entry.id);
    if (!categoryNames.has(entry.category)) errors.push(`条目类别不存在: ${entry.category}`);
    if (!Array.isArray(entry.keywords)) errors.push(`条目关键词必须是数组: ${entry.name}`);
    if (!POSITIONS.includes(entry.position)) errors.push(`条目位置无效: ${entry.name}`);
    if (!Number.isInteger(entry.depth) || entry.depth < 0 || entry.depth > 100) errors.push(`条目深度无效: ${entry.name}`);
    if (!Number.isInteger(entry.order)) errors.push(`条目顺序无效: ${entry.name}`);
  }
  const chapterIds = new Set(project.chapters.map((c) => c.chapterId));
  for (const asset of project.beatAssets || []) {
    if (!chapterIds.has(asset.chapterId)) errors.push(`节拍引用不存在的章节: ${asset.chapterId}`);
    if (!Array.isArray(asset.beats) || asset.beats.length < 2) errors.push(`章节 ${asset.chapterId} 节拍少于两个`);
    const beatIds = new Set((asset.beats || []).map((b) => b.beatId));
    if (beatIds.size !== (asset.beats || []).length) errors.push(`章节 ${asset.chapterId} 节拍编号重复`);
  }
  return errors;
}
