import { renderWorkspace } from './views/workspaceView.js';
import { renderWorldbook } from './views/worldbookView.js';
import { renderOutline, renderOverview } from './views/storyView.js';
import { renderSettings } from './views/settingsView.js';
import { toCharacterCard, toProjectPackage, toSillyTavernWorldbook } from '../domain/worldbook/exportWorldbook.js';

export class NovelAiPanel {
  constructor({ store, settingsStore, apiRouter, adapter, logger }) { this.store = store; this.settingsStore = settingsStore; this.apiRouter = apiRouter; this.adapter = adapter; this.logger = logger; this.root = null; this.tab = 'workspace'; this.overviewChapterId = null; this.unsubscribe = null; }
  async mount() {
    if (this.root || typeof document === 'undefined') return;
    await this.mountDrawerTemplate();
    this.root = document.createElement('div'); this.root.id = 'novelai-panel'; this.root.className = 'novelai-panel';
    const drawer = document.querySelector('#novelai-wrapper');
    if (!drawer) this.root.classList.add('openDrawer');
    const target = drawer || document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings') || document.body;
    target.appendChild(this.root);
    if (drawer) {
      const toggle = drawer.querySelector('.drawer-toggle');
      toggle?.addEventListener('click', () => this.toggleDrawer());
      toggle?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.toggleDrawer(); } });
    }
    this.unsubscribe = this.store.subscribe(() => this.render()); this.root.addEventListener('click', (event) => this.handleClick(event)); this.root.addEventListener('change', (event) => this.handleChange(event));
    this.render();
  }
  destroy() { this.unsubscribe?.(); this.unsubscribe = null; this.root?.remove(); this.root = null; }
  async mountDrawerTemplate() {
    if (document.querySelector('#novelai-wrapper')) return;
    const folder = getExtensionFolderName();
    const html = await this.adapter.renderTemplate?.(`third-party/${folder}`, 'drawer-component');
    if (!html || !String(html).trim()) return;
    const anchor = document.querySelector('#extensions-settings-button');
    if (anchor) anchor.insertAdjacentHTML('afterend', html);
    else (document.querySelector('#extensions_settings2') || document.body).insertAdjacentHTML('beforeend', html);
  }
  render() {
    if (!this.root) return;
    const project = this.store.getProject(); const settings = this.settingsStore.load();
    this.root.innerHTML = `<div class="nai-header"><h2>🧵 NovelAI 故事工作台</h2><span>${project ? `项目 ${project.projectId}` : '未导入项目'}</span><button class="nai-close" data-action="close-panel" aria-label="关闭">×</button></div><nav class="nai-tabs">${[['workspace','TXT→世界书'],['worldbook','📊 生成结果'],['outline','故事大纲'],['overview','🎬 当前章节概览'],['settings','设置']].map(([key,label]) => `<button class="${this.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</nav><div class="nai-content">${this.tab === 'workspace' ? renderWorkspace(project || {}) : this.tab === 'worldbook' ? renderWorldbook(project || {}) : this.tab === 'outline' ? renderOutline(project || {}) : this.tab === 'overview' ? renderOverview(project || {}, this.overviewChapterId || project?.runtime?.currentStage?.chapterId) : renderSettings(settings, { actor: this.settingsStore.getApiKey('actor'), director: this.settingsStore.getApiKey('director') })}</div>`;
    this.root.querySelector('#nai-txt-file')?.addEventListener('change', (event) => this.readFile(event.target.files?.[0]));
  }
  async readFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) { const parsed = JSON.parse(text); if (!parsed.schemaVersion && parsed.data?.character_book) throw new Error('这是角色卡文件，请使用世界书/工程包导入'); await this.store.replace(parsed); this.notify('success', '工程包导入成功'); }
      else { await this.store.importTxt(text); this.notify('success', `已导入 TXT（${text.length.toLocaleString()} 字）`); }
    } catch (error) { this.notify('error', error.message); }
  }
  notify(type, message) { this.adapter.notify(type, message); }
  toggleDrawer(force) { const drawer = document.querySelector('#novelai-wrapper'); const open = force === undefined ? !this.root.classList.contains('openDrawer') : force; this.root.classList.toggle('openDrawer', open); drawer?.querySelector('#novelai-icon')?.classList.toggle('openIcon', open); drawer?.querySelector('#novelai-icon')?.classList.toggle('closedIcon', !open); }
  async handleClick(event) {
    const target = event.target.closest('[data-tab],[data-action]'); if (!target) return;
    if (target.dataset.tab) { this.tab = target.dataset.tab; if (this.tab === 'overview' && !this.overviewChapterId) this.overviewChapterId = this.store.getProject()?.runtime?.currentStage?.chapterId || this.store.getProject()?.chapters?.[0]?.chapterId; this.render(); return; }
    const action = target.dataset.action;
    try {
      if (action === 'capture') { const source = this.root.querySelector('#nai-source-text')?.value || ''; if (source !== this.store.getProject()?.sourceText) await this.store.update((draft) => { draft.sourceText = source; draft.sourceVersion += 1; return draft; }); const result = await this.store.capture(this.root.querySelector('#nai-chapter-regex')?.value); this.root.querySelector('#nai-capture-result').textContent = result.errors?.length ? `❌ ${result.errors.join('；')}` : `✅ 检测到 ${result.chapters.length} 个章节；前 ${result.matches.length} 个标题：${result.matches.join('、')}`; }
      else if (action === 'close-panel') this.toggleDrawer(false);
      else if (action === 'preview-clean') { const result = await this.store.cleanPreviewText(this.root.querySelector('#nai-clean-patterns')?.value || ''); this.root.querySelector('#nai-clean-result').textContent = `命中 ${result.count} 处`; this.root.querySelector('[data-action="apply-clean"]').disabled = !result.count; }
      else if (action === 'apply-clean') { const result = await this.store.applyCleanPreview(); this.notify('success', `已删除 ${result.deletedCount} 处重复片段，章节需要重新检查`); }
      else if (action === 'clean-impurities') { const ok = await this.adapter.confirm('删除杂质', '将删除章节外内容及明显广告/作者注释，是否继续？'); if (ok) { const result = await this.store.cleanImpurities(); this.notify('success', `已处理 ${result.removed.length} 处疑似杂质`); } }
      else if (action === 'edit-chapter') await this.editChapter(Number(target.dataset.id));
      else if (action === 'confirm-chapter') await this.store.confirmChapter(Number(target.dataset.id));
      else if (action === 'merge-chapter') { if (await this.adapter.confirm('合并章节', '合并后会使受影响节拍/任务需要重新确认，继续吗？')) await this.store.mergeChapter(Number(target.dataset.id), target.dataset.direction === 'previous' ? 'previous' : 'next'); }
      else if (action === 'delete-selected-chapters') await this.deleteSelectedChapters();
      else if (action === 'export-project') this.adapter.downloadJson(`novelai-project-${Date.now()}.json`, toProjectPackage(this.store.getProject()));
      else if (action === 'import-project') this.root.querySelector('#nai-txt-file')?.click();
      else if (action === 'preview-prompt') { const { buildPromptPreview } = await import('../domain/worldbook/prompts.js'); const { buildCategorySchema } = await import('../domain/worldbook/categorySchema.js'); this.notify('info', `动态 Schema：${JSON.stringify(buildCategorySchema(this.store.getProject().categoryConfigs))}`); await this.adapter.confirm('提示词预览', buildPromptPreview(this.store.getProject().categoryConfigs).slice(0, 6000)); }
      else if (action === 'extract-worldbook') { await this.store.runWorldbook(); this.notify('success', '世界书提取完成'); }
      else if (action === 'cancel-job') { this.store.cancelActiveJob(); this.notify('info', '已请求取消，已完成章节会保留'); }
      else if (action === 'export-worldbook') { this.adapter.downloadJson(`novelai-worldbook-${Date.now()}.json`, toSillyTavernWorldbook(this.store.getProject().worldbookEntries)); await this.store.update((draft) => { draft.exports.lastWorldbookAt = Date.now(); draft.exports.exportVersion = (draft.exports.exportVersion || 0) + 1; return draft; }); }
      else if (action === 'export-card') { const project = this.store.getProject(); const name = project?.chapters?.[0]?.chapterName || 'NovelAI'; const card = toCharacterCard(project.worldbookEntries, { name, projectId: project.projectId, schemaVersion: project.schemaVersion }); const wroteMetadata = await this.adapter.writeCharacterExtension({ schemaVersion: project.schemaVersion, projectId: project.projectId, worldbook: card.data.character_book }); this.adapter.downloadJson(`novelai-character-card-${Date.now()}.json`, card); await this.store.update((draft) => { draft.exports.lastCharacterCardAt = Date.now(); return draft; }); this.notify(wroteMetadata ? 'success' : 'warning', wroteMetadata ? '已导出角色卡，并同步写入当前角色的插件元数据；请导入导出的角色卡后开始聊天' : '当前无有效角色卡，已导出独立角色卡'); }
      else if (action === 'toggle-category') await this.toggleCategory(target.dataset.id, 'expanded');
      else if (action === 'edit-category') await this.editCategory(target.dataset.id);
      else if (action === 'add-category') await this.addCategory();
      else if (action === 'toggle-light') await this.toggleEntry(target.dataset.id);
      else if (action === 'edit-entry') await this.editEntry(target.dataset.id);
      else if (action === 'toggle-entry') await this.toggleEntryExpanded(target.dataset.id);
      else if (action === 'delete-entry') await this.deleteEntries([target.dataset.id]);
      else if (action === 'delete-selected-entries') await this.deleteEntries(this.selectedEntries());
      else if (action === 'merge-selected') await this.mergeSelected();
      else if (action === 'organize-selected') await this.organizeSelected();
      else if (action === 'parse-beats') { await this.store.runBeats(); this.notify('success', '节拍解析完成'); }
      else if (action === 'reroll-beat') { await this.store.rerollBeat(Number(target.dataset.id)); this.notify('success', '本章节拍已重 roll'); }
      else if (action === 'view-overview') { this.overviewChapterId = Number(target.dataset.id); this.tab = 'overview'; this.render(); }
      else if (action === 'view-chapter') { this.overviewChapterId = Number(target.dataset.id); this.render(); }
      else if (action === 'jump-current-stage') { this.overviewChapterId = this.store.getProject()?.runtime?.currentStage?.chapterId || this.overviewChapterId; this.render(); }
      else if (action === 'start-chapter') { await this.store.startChapter(Number(target.dataset.id)); this.overviewChapterId = Number(target.dataset.id); this.notify('success', '故事坐标已设置'); }
      else if (action === 'previous-beat') await this.store.shiftBeat(-1);
      else if (action === 'next-beat') await this.store.shiftBeat(1);
      else if (action === 'edit-beat') await this.editBeat(target.dataset.id);
      else if (action === 'edit-story-summary') await this.editStorySummary();
      else if (action === 'merge-beat') await this.mergeBeat(target.dataset.id, target.dataset.direction);
      else if (action === 'move-beat-order') await this.moveBeatOrder(target.dataset.id, Number(target.dataset.direction));
      else if (action === 'delete-beat') await this.deleteBeat(target.dataset.id);
      else if (action === 'save-settings') this.saveSettings();
      else if (action === 'list-models') { const models = await this.apiRouter.listModels(target.dataset.role); this.notify('info', models.length ? `找到 ${models.length} 个模型：${models.slice(0, 10).join('、')}` : '未找到模型'); }
      else if (action === 'test-api') { await this.apiRouter.generate({ role: target.dataset.role, prompt: 'Reply with OK.' }); this.notify('success', 'API 连接成功'); }
    } catch (error) { this.logger?.error('UI 操作失败', { action, error: error.message }); this.notify('error', error.message); }
  }
  async handleChange(event) {
    const el = event.target;
    if (el.dataset.categoryEnabled) await this.store.update((draft) => { const category = draft.categoryConfigs.find((item) => item.id === el.dataset.categoryEnabled); if (category) category.enabled = el.checked; return draft; });
    if (el.dataset.categoryPrompt) await this.store.update((draft) => { const category = draft.categoryConfigs.find((item) => item.id === el.dataset.categoryPrompt); if (category) category.prompt = el.value; return draft; });
    if (el.dataset.entryContent) await this.store.update((draft) => { const entry = draft.worldbookEntries.find((item) => item.id === el.dataset.entryContent); if (entry) entry.content = el.value; return draft; });
    if (el.dataset.apiKey) this.settingsStore.setApiKey(el.dataset.apiKey, el.value);
  }
  selectedEntries() { return [...this.root.querySelectorAll('[data-select-entry]:checked')].map((el) => el.dataset.selectEntry); }
  selectedChapters() { return [...this.root.querySelectorAll('[data-select-chapter]:checked')].map((el) => Number(el.dataset.selectChapter)); }
  async editChapter(id) { const chapter = this.store.getProject().chapters.find((item) => item.chapterId === id); const name = globalThis.prompt('章节名称', chapter.chapterName); if (name === null) return; const text = globalThis.prompt('章节正文（可粘贴长文本）', chapter.text); if (text === null) return; await this.store.editChapter(id, { chapterName: name, text }); }
  async deleteSelectedChapters() { const ids = this.selectedChapters(); if (!ids.length || !(await this.adapter.confirm('删除章节', `确认删除 ${ids.length} 个章节？`))) return; await this.store.deleteChapter(ids); }
  async toggleCategory(id, field) { await this.store.update((draft) => { const category = draft.categoryConfigs.find((item) => item.id === id); if (category) category[field] = !category[field]; return draft; }); }
  async addCategory() { const name = globalThis.prompt('新类别名称'); if (!name?.trim()) return; await this.store.update((draft) => { draft.categoryConfigs.push({ id: `category_${Date.now()}`, name: name.trim(), enabled: true, fields: ['名称', '关键词'], prompt: '请根据原文提取该类别信息。', defaultConfig: { position: 'before_char', depth: 4, order: 300, autoIncrementOrder: true } }); return draft; }); }
  async toggleEntry(id) { await this.store.update((draft) => { const entry = draft.worldbookEntries.find((item) => item.id === id); if (entry) entry.constant = !entry.constant; return draft; }); }
  async toggleEntryExpanded(id) { await this.store.update((draft) => { const entry = draft.worldbookEntries.find((item) => item.id === id); if (entry) entry.expanded = !entry.expanded; return draft; }); }
  async editCategory(id) { const category = this.store.getProject().categoryConfigs.find((item) => item.id === id); if (!category) return; const position = globalThis.prompt('默认位置（before_char/after_char/before_author/after_author/depth）', category.defaultConfig?.position || 'before_char'); if (position === null) return; if (!['before_char', 'after_char', 'before_author', 'after_author', 'depth'].includes(position)) throw new Error('位置无效'); const depth = Number(globalThis.prompt('默认深度 0-100', category.defaultConfig?.depth ?? 4)); const order = Number(globalThis.prompt('默认起始顺序', category.defaultConfig?.order ?? 100)); const fields = globalThis.prompt('字段列表（逗号分隔）', category.fields.join('、')); if (fields === null) return; const autoIncrementOrder = await this.adapter.confirm('顺序自动递增', '勾选等价于确认：同类条目顺序按起始值自动递增。'); const applyExisting = await this.adapter.confirm('应用到已有条目', '是否同时更新该类别下已有条目的位置、深度和顺序？'); await this.store.update((draft) => { const target = draft.categoryConfigs.find((item) => item.id === id); target.fields = fields.split(/[、,，]/).map((field) => field.trim()).filter(Boolean); target.defaultConfig = { ...target.defaultConfig, position, depth: Math.min(100, Math.max(0, Number.isFinite(depth) ? depth : 4)), order: Number.isFinite(order) ? Math.trunc(order) : 100, autoIncrementOrder }; if (applyExisting) draft.worldbookEntries.filter((entry) => entry.category === target.name).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry, index) => { entry.position = target.defaultConfig.position; entry.depth = target.defaultConfig.depth; entry.order = target.defaultConfig.autoIncrementOrder ? target.defaultConfig.order + index : target.defaultConfig.order; }); return draft; }); }
  async editEntry(id) { const entry = this.store.getProject().worldbookEntries.find((item) => item.id === id); const content = globalThis.prompt(`编辑 ${entry.name} 内容`, entry.content); if (content === null) return; const position = globalThis.prompt('位置（before_char/after_char/before_author/after_author/depth）', entry.position || 'before_char'); if (position === null) return; if (!['before_char', 'after_char', 'before_author', 'after_author', 'depth'].includes(position)) throw new Error('位置无效'); const depth = Number(globalThis.prompt('深度 0-100', entry.depth ?? 4)); const order = Number(globalThis.prompt('顺序', entry.order ?? 100)); await this.store.update((draft) => { const target = draft.worldbookEntries.find((item) => item.id === id); Object.assign(target, { content, position, depth: Math.min(100, Math.max(0, Number.isFinite(depth) ? depth : 4)), order: Number.isFinite(order) ? Math.trunc(order) : 100 }); return draft; }); }
  async deleteEntries(ids) { if (!ids.length || !(await this.adapter.confirm('删除条目', `确认删除 ${ids.length} 个条目？`))) return; await this.store.update((draft) => { draft.worldbookEntries = draft.worldbookEntries.filter((entry) => !ids.includes(entry.id)); return draft; }); }
  async mergeSelected() { const ids = this.selectedEntries(); if (ids.length < 2) throw new Error('至少选择两个条目'); const { mergeSelectedEntries } = await import('../domain/worldbook/mergeEntry.js'); const name = globalThis.prompt('合并后的名称（留空使用主条目）') || ''; const categories = this.store.getProject().categoryConfigs.map((category) => category.name); const category = globalThis.prompt(`目标分类（${categories.join('、')}）`, this.store.getProject().worldbookEntries.find((entry) => entry.id === ids[0])?.category || ''); if (category === null) return; if (!categories.includes(category)) throw new Error('目标分类不存在'); await this.store.update((draft) => { draft.worldbookEntries = mergeSelectedEntries(draft.worldbookEntries, ids, { name, category }); return draft; }); }
  async organizeSelected() { const ids = this.selectedEntries(); if (!ids.length) throw new Error('请先选择条目'); for (const id of ids) { const entry = this.store.getProject().worldbookEntries.find((item) => item.id === id); const result = await this.apiRouter.generate({ role: 'actor', prompt: `请整理以下世界书内容，去除重复信息并保留独特细节，直接输出 Markdown：\n${entry.content}` }); if (result.text?.trim()) await this.store.update((draft) => { draft.worldbookEntries.find((item) => item.id === id).content = result.text.trim(); return draft; }); } this.notify('success', 'AI 整理完成'); }
  async editBeat(beatId) { const project = this.store.getProject(); const asset = project.beatAssets.find((item) => item.chapterId === this.overviewChapterId); const beat = asset?.beats.find((item) => item.beatId === beatId); if (!beat) return; const summary = globalThis.prompt('事件摘要', beat.summary); if (summary === null) return; const exitCondition = globalThis.prompt('退出条件', beat.exitCondition); if (exitCondition === null) return; const text = globalThis.prompt('节拍原文', beat.text); if (text === null) return; const { updateBeatAsset } = await import('../domain/beats/mutateBeats.js'); await this.store.update((draft) => { const chapter = draft.chapters.find((item) => item.chapterId === this.overviewChapterId); const assetIndex = draft.beatAssets.findIndex((item) => item.chapterId === this.overviewChapterId); draft.beatAssets[assetIndex] = updateBeatAsset(chapter, draft.beatAssets[assetIndex], beatId, { summary, exitCondition, text }); return draft; }); }
  async editStorySummary() { const asset = this.store.getProject().beatAssets.find((item) => item.chapterId === this.overviewChapterId); const summary = globalThis.prompt('故事摘要', asset?.summary || ''); if (summary === null) return; await this.store.update((draft) => { draft.beatAssets.find((item) => item.chapterId === this.overviewChapterId).summary = summary; return draft; }); }
  async mergeBeat(beatId, direction) { const asset = this.store.getProject().beatAssets.find((item) => item.chapterId === this.overviewChapterId); if (!asset || asset.beats.length <= 2) throw new Error('每章至少保留两个节拍，不能继续合并'); if (!(await this.adapter.confirm('合并节拍', '合并后会重新编号，并要求重新选择故事坐标。确认？'))) return; const { mergeAdjacentBeatAsset } = await import('../domain/beats/mutateBeats.js'); await this.store.update((draft) => { const chapter = draft.chapters.find((item) => item.chapterId === this.overviewChapterId); const index = draft.beatAssets.findIndex((item) => item.chapterId === this.overviewChapterId); draft.beatAssets[index] = mergeAdjacentBeatAsset(chapter, draft.beatAssets[index], beatId, direction); draft.runtime.currentStage = null; return draft; }); }
  async moveBeatOrder(beatId, direction) { const { moveBeatAsset } = await import('../domain/beats/mutateBeats.js'); await this.store.update((draft) => { const chapter = draft.chapters.find((item) => item.chapterId === this.overviewChapterId); const index = draft.beatAssets.findIndex((item) => item.chapterId === this.overviewChapterId); draft.beatAssets[index] = moveBeatAsset(chapter, draft.beatAssets[index], beatId, direction); draft.runtime.currentStage = null; return draft; }); }
  async deleteBeat(beatId) { const asset = this.store.getProject().beatAssets.find((item) => item.chapterId === this.overviewChapterId); if (!asset || asset.beats.length <= 2) throw new Error('每章至少保留两个有效节拍；请先重 roll 本章而不是继续删除'); if (!(await this.adapter.confirm('删除节拍', '删除后将重新编号，当前坐标需要重新选择。确认？'))) return; await this.store.update((draft) => { const targetAsset = draft.beatAssets.find((item) => item.chapterId === this.overviewChapterId); targetAsset.beats = targetAsset.beats.filter((item) => item.beatId !== beatId).map((item, index) => ({ ...item, beatId: `b${index + 1}`, order: index })); if (draft.runtime.currentStage?.chapterId === this.overviewChapterId) draft.runtime.currentStage = null; return draft; }); }
  saveSettings() { const settings = this.settingsStore.load(); settings.enabled = !!this.root.querySelector('#nai-enabled')?.checked; settings.useTavernApi = !!this.root.querySelector('#nai-use-tavern')?.checked; settings.maxConcurrency = Math.max(1, Number(this.root.querySelector('#nai-concurrency')?.value) || 1); for (const role of ['actor', 'director']) { const keyInput = this.root.querySelector(`[data-api-key="${role}"]`); if (keyInput) this.settingsStore.setApiKey(role, keyInput.value); for (const key of ['provider', 'endpoint', 'model', 'maxTokens', 'timeoutMs', 'maxRetries', 'stream']) { const el = this.root.querySelector(`[data-api="${role}"][data-key="${key}"]`); if (el) settings[role][key] = key === 'stream' ? el.checked : ['maxTokens', 'timeoutMs', 'maxRetries'].includes(key) ? Number(el.value) || 0 : el.value; } } this.settingsStore.save(settings); this.notify('success', '设置已保存'); }
}

function getExtensionFolderName() {
  const match = /\/scripts\/extensions\/third-party\/([^/]+)\//.exec(import.meta.url);
  return match?.[1] ? decodeURIComponent(match[1]) : 'NovelAI';
}
