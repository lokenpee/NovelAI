import { clone, SCHEMA_VERSION } from '../constants.js';
import { createProject } from './createProject.js';

export function migrateProject(input) {
  if (!input || typeof input !== 'object') throw new Error('工程包必须是 JSON 对象');
  if (input.schemaVersion === SCHEMA_VERSION || (input.schemaVersion == null && input.projectId)) {
    const base = createProject(input.sourceText || ''); const source = clone(input);
    return {
      ...base, ...source, schemaVersion: SCHEMA_VERSION, version: Number(input.version) || 1,
      categoryConfigs: Array.isArray(source.categoryConfigs) ? source.categoryConfigs : base.categoryConfigs,
      chapters: Array.isArray(source.chapters) ? source.chapters : [], worldbookEntries: Array.isArray(source.worldbookEntries) ? source.worldbookEntries : [], beatAssets: Array.isArray(source.beatAssets) ? source.beatAssets : [],
      processing: { ...base.processing, ...(source.processing || {}), worldbook: { ...base.processing.worldbook, ...(source.processing?.worldbook || {}) }, beats: { ...base.processing.beats, ...(source.processing?.beats || {}) } },
      runtime: { ...base.runtime, ...(source.runtime || {}) }, exports: { ...base.exports, ...(source.exports || {}) }
    };
  }
  throw new Error(`不支持的数据格式版本: ${input.schemaVersion}`);
}
