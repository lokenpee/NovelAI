import { PROCESS_STATUS } from '../../domain/constants.js';
import { normalizeBeats } from '../../domain/beats/normalizeBeats.js';
import { buildBeatPrompt } from '../prompts/beatPrompt.js';
import { Semaphore } from '../api/semaphore.js';

export async function runBeatJob(project, { apiRouter, concurrency = 1, onProgress = () => {}, signal, chapterIds, force = false } = {}) {
  const semaphore = new Semaphore(concurrency);
  const assets = structuredClone(project.beatAssets || []);
  const results = [];
  const chapters = project.chapters.filter((chapter) => (!chapterIds || chapterIds.includes(chapter.chapterId)) && chapter.confirmed !== false && (force || project.processing?.beats?.[chapter.chapterId]?.status !== PROCESS_STATUS.SUCCEEDED));
  if (!chapters.length) {
    if ((project.beatAssets || []).length) return { assets, results: [] };
    throw new Error('没有已确认的章节可解析，请先检查章节或保存章节编辑');
  }
  await Promise.all(chapters.map(async (chapter) => {
    let release = null;
    try {
      release = await semaphore.acquire(signal);
      onProgress(chapter.chapterId, PROCESS_STATUS.RUNNING);
      const response = await apiRouter.generate({ role: 'actor', prompt: buildBeatPrompt(chapter), signal });
      const parsed = parseBeatJson(response.text);
      const normalized = normalizeBeats(chapter, parsed);
      if (normalized.errors.length) throw new Error(normalized.errors.join('；'));
      const index = assets.findIndex((item) => item.chapterId === chapter.chapterId);
      if (index >= 0) assets[index] = normalized.asset; else assets.push(normalized.asset);
      results.push({ chapterId: chapter.chapterId, status: PROCESS_STATUS.SUCCEEDED }); onProgress(chapter.chapterId, PROCESS_STATUS.SUCCEEDED);
    } catch (error) {
      results.push({ chapterId: chapter.chapterId, status: signal?.aborted ? PROCESS_STATUS.CANCELLED : PROCESS_STATUS.FAILED, error: error.message });
      onProgress(chapter.chapterId, signal?.aborted ? PROCESS_STATUS.CANCELLED : PROCESS_STATUS.FAILED, error);
    } finally { release?.(); }
  }));
  return { assets, results };
}

function parseBeatJson(text) {
  const source = String(text || ''); const start = source.indexOf('{'); const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('节拍响应不是 JSON');
  return JSON.parse(source.slice(start, end + 1));
}
