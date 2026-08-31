import { createProject } from '../../domain/project/createProject.js';
import { createSnapshot } from '../../domain/project/snapshot.js';
import { captureChapters } from '../../domain/chapter/captureChapters.js';
import { applyClean, previewClean, removeImpurities } from '../../domain/text/cleanText.js';
import { deleteChapters, mergeAdjacentChapter, updateChapter } from '../../domain/chapter/chapterMutations.js';
import { startFromChapter, moveBeat, setStage } from '../../domain/runtime/stageState.js';
import { runWorldbookJob } from '../jobs/worldbookJob.js';
import { runBeatJob } from '../jobs/beatJob.js';
import { clone, DEFAULT_CHAPTER_REGEX } from '../../domain/constants.js';
import { migrateProject } from '../../domain/project/migrateProject.js';
import { invalidateChapterAssets } from '../../domain/project/invalidateChapterAssets.js';

export class AppStore {
  constructor({ projectStore, apiRouter, settingsStore, logger } = {}) { this.projectStore = projectStore; this.apiRouter = apiRouter; this.settingsStore = settingsStore; this.logger = logger; this.project = null; this.listeners = new Set(); this.cleanPreview = null; this.activeJobController = null; }
  async init() { this.project = await this.projectStore.load(); return this.project; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getProject() { return this.project; }
  async replace(project) { const migrated = migrateProject(project); this.project = clone(migrated); await this.projectStore.save(this.project); this.listeners.forEach((listener) => listener(this.project)); return this.project; }
  async update(mutator) {
    if (!this.project) throw new Error('尚未导入小说或工程包');
    const next = typeof mutator === 'function' ? createSnapshot(this.project, (draft) => Object.assign(draft, mutator(draft) || {})) : mutator;
    return this.replace(next);
  }
  async importTxt(text) { return this.replace(createProject(text)); }
  async capture(pattern = this.project?.chapterRegex || DEFAULT_CHAPTER_REGEX) {
    const result = captureChapters(this.project.sourceText, pattern, this.project.sourceVersion);
    if (result.errors.length) return result;
    await this.update((draft) => { draft.chapterRegex = pattern; draft.chapters = result.chapters; draft.beatAssets = []; draft.outline = {}; draft.runtime.currentStage = null; return draft; });
    return result;
  }
  async cleanPreviewText(patterns) { this.cleanPreview = previewClean(this.project.sourceText, patterns); return this.cleanPreview; }
  async applyCleanPreview() { if (!this.cleanPreview) throw new Error('请先预览清洗命中'); const result = applyClean(this.project.sourceText, this.cleanPreview); await this.update((draft) => { draft.sourceText = result.text; draft.sourceVersion += 1; draft.chapters = []; draft.beatAssets = []; draft.runtime.currentStage = null; return draft; }); this.cleanPreview = null; return result; }
  async cleanImpurities() { const result = removeImpurities(this.project.sourceText, this.project.chapterRegex); if (result.text !== this.project.sourceText) await this.update((draft) => { draft.sourceText = result.text; draft.sourceVersion += 1; draft.chapters = []; draft.beatAssets = []; draft.runtime.currentStage = null; return draft; }); return result; }
  async editChapter(id, changes) { return this.update((draft) => { draft.chapters = updateChapter(draft.chapters, id, changes); return invalidateChapterAssets(draft, [id]); }); }
  async confirmChapter(id) { return this.update((draft) => { const chapter = draft.chapters.find((item) => item.chapterId === id); if (!chapter) throw new Error('章节不存在'); chapter.confirmed = true; chapter.status = 'pending'; return draft; }); }
  async deleteChapter(ids) { return this.update((draft) => { draft.chapters = deleteChapters(draft.chapters, ids); return invalidateChapterAssets(draft, ids); }); }
  async mergeChapter(id, direction) { return this.update((draft) => { const before = draft.chapters.find((chapter) => chapter.chapterId === id); const index = draft.chapters.findIndex((chapter) => chapter.chapterId === id); const adjacent = direction === 'previous' ? draft.chapters[index - 1] : draft.chapters[index + 1]; draft.chapters = mergeAdjacentChapter(draft.chapters, id, direction); return invalidateChapterAssets(draft, [before?.chapterId, adjacent?.chapterId].filter(Boolean)); }); }
  async runWorldbook(options = {}) {
    if (this.settingsStore.load().enabled === false) throw new Error('插件总开关已关闭，不能启动世界书任务');
    if (this.activeJobController) throw new Error('已有模型任务正在执行');
    const controller = new AbortController(); this.activeJobController = controller;
    try { const base = clone(this.project); const result = await runWorldbookJob(base, { apiRouter: this.apiRouter, concurrency: this.settingsStore.load().maxConcurrency, ...options, signal: options.signal || controller.signal, onProgress: (id, status, error) => { this.project.processing.worldbook[id] = { status, error: error?.message || null, updatedAt: Date.now() }; this.projectStore.save(this.project).catch(() => {}); this.listeners.forEach((listener) => listener(this.project)); } });
      if (this.project.version !== result.baseVersion) throw new Error('项目在任务期间发生变化，已丢弃旧世界书结果，请重新执行');
      await this.update((draft) => { draft.worldbookEntries = result.entries; draft.processing.overall = controller.signal.aborted ? 'cancelled' : 'succeeded'; return draft; }); return result;
    } finally { if (this.activeJobController === controller) this.activeJobController = null; }
  }
  async runBeats(options = {}) {
    if (this.settingsStore.load().enabled === false) throw new Error('插件总开关已关闭，不能启动节拍任务');
    if (this.activeJobController) throw new Error('已有模型任务正在执行');
    const controller = new AbortController(); this.activeJobController = controller;
    try { const base = clone(this.project); const result = await runBeatJob(base, { apiRouter: this.apiRouter, concurrency: this.settingsStore.load().maxConcurrency, ...options, signal: options.signal || controller.signal, onProgress: (id, status, error) => { this.project.processing.beats[id] = { status, error: error?.message || null, updatedAt: Date.now() }; this.projectStore.save(this.project).catch(() => {}); this.listeners.forEach((listener) => listener(this.project)); } });
      if (this.project.version !== base.version) throw new Error('项目在任务期间发生变化，已丢弃旧节拍结果，请重新执行');
      await this.update((draft) => { draft.beatAssets = result.assets; result.assets.forEach((asset) => { draft.outline[asset.chapterId] = { status: 'succeeded', summary: asset.summary }; }); return draft; }); return result;
    } finally { if (this.activeJobController === controller) this.activeJobController = null; }
  }
  async rerollBeat(chapterId, options = {}) { return this.runBeats({ ...options, chapterIds: [chapterId], force: true }); }
  cancelActiveJob() { this.activeJobController?.abort(); }
  async setStage(next, reason) { return this.update((draft) => { draft.runtime = setStage(draft.runtime, draft.beatAssets, next, reason); return draft; }); }
  async startChapter(chapterId) { return this.update((draft) => { draft.runtime = startFromChapter(draft.runtime, draft.beatAssets, chapterId); return draft; }); }
  async shiftBeat(direction) { return this.update((draft) => { draft.runtime = moveBeat(draft.runtime, draft.beatAssets, direction); return draft; }); }
}
