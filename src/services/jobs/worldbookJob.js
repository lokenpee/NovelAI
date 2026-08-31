import { PROCESS_STATUS } from '../../domain/constants.js';
import { buildCategorySchema } from '../../domain/worldbook/categorySchema.js';
import { buildExtractionPrompt } from '../../domain/worldbook/prompts.js';
import { mergeEntries } from '../../domain/worldbook/mergeEntry.js';
import { parseExtractionResponse } from '../../domain/worldbook/parseExtractionResponse.js';
import { Semaphore } from '../api/semaphore.js';

export async function runWorldbookJob(project, { apiRouter, concurrency = 1, onProgress = () => {}, signal } = {}) {
  const baseVersion = project.version;
  const semaphore = new Semaphore(concurrency);
  let entries = structuredClone(project.worldbookEntries || []);
  const results = [];
  const chapters = project.chapters.filter((chapter) => project.processing?.worldbook?.[chapter.chapterId]?.status !== PROCESS_STATUS.SUCCEEDED);
  await Promise.all(chapters.map(async (chapter) => {
    let release = null;
    try {
      release = await semaphore.acquire(signal);
      onProgress(chapter.chapterId, PROCESS_STATUS.RUNNING);
      const prompt = buildExtractionPrompt(chapter, project.categoryConfigs);
      const response = await apiRouter.generate({ role: 'actor', prompt, jsonSchema: buildCategorySchema(project.categoryConfigs), signal });
      const extracted = parseExtractionResponse(response.text, project.categoryConfigs, chapter.chapterId);
      entries = mergeEntries(entries, extracted);
      results.push({ chapterId: chapter.chapterId, status: extracted.length ? PROCESS_STATUS.SUCCEEDED : PROCESS_STATUS.EMPTY, count: extracted.length });
      onProgress(chapter.chapterId, extracted.length ? PROCESS_STATUS.SUCCEEDED : PROCESS_STATUS.EMPTY);
    } catch (error) {
      results.push({ chapterId: chapter.chapterId, status: signal?.aborted ? PROCESS_STATUS.CANCELLED : PROCESS_STATUS.FAILED, error: error.message });
      onProgress(chapter.chapterId, signal?.aborted ? PROCESS_STATUS.CANCELLED : PROCESS_STATUS.FAILED, error);
    } finally { release?.(); }
  }));
  return { baseVersion, entries, results };
}
