import { renderWorkspace } from './views/workspaceView.js';
import { renderOutline, renderOverview } from './views/storyView.js';
import { renderSettings } from './views/settingsView.js';
import { toCharacterCard, toProjectPackage, toSillyTavernWorldbook } from '../domain/worldbook/exportWorldbook.js';
import { ensureDrawerLauncher, getExtensionFolderName } from './drawerLauncher.js';
import { readImportFile } from '../services/files/readImportFile.js';
import { NOVELAI_REPO_URL, updateExtensionFromRepo } from '../services/platform/extensionUpdater.js';
import { summarizeCleanPreview } from '../domain/text/summarizeCleanPreview.js';
import { renderCleanPreviewSummary } from './views/cleanPreviewView.js';

export class NovelAiPanel {
  constructor({ store, settingsStore, apiRouter, adapter, logger }) {
    this.store = store;
    this.settingsStore = settingsStore;
    this.apiRouter = apiRouter;
    this.adapter = adapter;
    this.logger = logger;
    this.root = null;
    this.drawerRoot = null;
    this.tab = 'workspace';
    this.overviewChapterId = null;
    this.openChapterId = null;
    this.openCategoryIds = new Set();
    this.openEntryIds = new Set();
    this.collapsedSections = new Set();
    this.updateInProgress = false;
    this.unsubscribe = null;
  }

  async mount() {
    if (this.root || typeof document === 'undefined') return;
    const drawer = await this.ensureDrawer();
    this.root = document.createElement('div');
    this.root.id = 'novelai-panel';
    this.root.className = 'novelai-panel';
    if (!drawer) this.root.classList.add('openDrawer');
    const target = drawer || document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings') || document.body;
    target.appendChild(this.root);
    if (drawer) {
      const toggle = drawer.querySelector('.drawer-toggle');
      toggle?.addEventListener('click', () => this.toggleDrawer());
      toggle?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.toggleDrawer();
        }
      });
    }
    this.unsubscribe = this.store.subscribe(() => this.render());
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    this.root.addEventListener('dragover', (event) => this.handleDragOver(event));
    this.root.addEventListener('dragleave', (event) => this.handleDragLeave(event));
    this.root.addEventListener('drop', (event) => this.handleDrop(event));
    this.render();
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root?.remove();
    this.root = null;
    this.drawerRoot?.remove();
    this.drawerRoot = null;
  }

  async ensureDrawer() {
    this.drawerRoot = await ensureDrawerLauncher({ adapter: this.adapter, documentRef: document });
    return this.drawerRoot;
  }

  render({ preserveScroll = true } = {}) {
    if (!this.root) return;
    const previousScrollTop = preserveScroll ? (this.root.querySelector('.nai-content')?.scrollTop || 0) : 0;
    const project = this.store.getProject();
    const settings = this.settingsStore.load();
    const hasProjectData = !!project && (String(project.sourceText || '').trim() || (project.chapters || []).length || (project.worldbookEntries || []).length || (project.beatAssets || []).length);
    const loadedLabel = hasProjectData ? '项目已载入' : '等待导入小说';
    const tabLabels = [
      ['workspace', '&#128218; TXT\u8f6c\u4e16\u754c\u4e66'],
      ['outline', '&#129517; \u6545\u4e8b\u5927\u7eb2'],
      ['overview', '&#127917; \u5f53\u524d\u7ae0\u8282\u6982\u89c8'],
      ['settings', '&#9881; \u8bbe\u7f6e']
    ];
    const body = this.tab === 'workspace'
      ? renderWorkspace(project || {}, {
        openChapterId: this.openChapterId,
        openCategoryIds: this.openCategoryIds,
        openEntryIds: this.openEntryIds,
        isProcessing: this.store.isJobRunning?.() || false,
        collapsedSections: this.collapsedSections,
      })
      : this.tab === 'outline'
        ? renderOutline(project || {}, { collapsedSections: this.collapsedSections })
        : this.tab === 'overview'
          ? renderOverview(project || {}, this.overviewChapterId || project?.runtime?.currentStage?.chapterId, { collapsedSections: this.collapsedSections })
          : renderSettings(settings, { actor: this.settingsStore.getApiKey('actor'), director: this.settingsStore.getApiKey('director') });
    this.root.innerHTML = `<div class="nai-app-header"><div class="nai-brand"><span class="nai-brand-icon">&#127917;</span><div><h2>NovelAI</h2><span>A1.2 · ${loadedLabel}</span></div></div><div class="nai-header-actions"><button class="nai-btn nai-btn-small" data-action="update-plugin" ${this.updateInProgress ? 'disabled' : ''}>${this.updateInProgress ? '\u23f3 \u66f4\u65b0\u4e2d...' : '\u66f4\u65b0\u63d2\u4ef6'}</button><button class="nai-btn nai-btn-small nai-close" data-action="close-panel" aria-label="\u5173\u95ed">&times;</button></div></div><nav class="nai-tabs">${tabLabels.map(([key, label]) => `<button class="${this.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</nav><main class="nai-content">${body}</main>`;
    const nextContent = this.root.querySelector('.nai-content');
    if (nextContent && previousScrollTop) nextContent.scrollTop = previousScrollTop;
    this.root.querySelector('#nai-txt-file')?.addEventListener('change', (event) => this.readFile(event.target.files?.[0]));
  }

  async readFile(file) {
    if (!file) return;
    try {
      const imported = await readImportFile(file);
      if (imported.kind === 'json') {
        const parsed = JSON.parse(imported.text);
        if (!parsed.schemaVersion && parsed.data?.character_book) throw new Error('\u8fd9\u662f\u89d2\u8272\u5361\u6587\u4ef6\uff0c\u8bf7\u4f7f\u7528\u4e16\u754c\u4e66/\u5de5\u7a0b\u5305\u5bfc\u5165');
        this.openChapterId = null;
        await this.store.replace(parsed);
        this.notify('success', '\u5de5\u7a0b\u5305\u5bfc\u5165\u6210\u529f');
      } else {
        await this.store.importTxt(imported.text, { name: file.name, size: file.size, lastModified: file.lastModified, encoding: imported.encoding });
        this.openChapterId = null;
        this.notify('success', `\u5df2\u5bfc\u5165 TXT\uff08${imported.text.length.toLocaleString()} \u5b57\uff0c${imported.encoding}\uff09`);
      }
    } catch (error) {
      this.notify('error', error.message);
    }
  }

  handleDragOver(event) {
    const zone = event.target.closest('.nai-upload-zone');
    if (!zone) return;
    event.preventDefault();
    zone.classList.add('dragover');
  }

  handleDragLeave(event) { event.target.closest('.nai-upload-zone')?.classList.remove('dragover'); }

  handleDrop(event) {
    const zone = event.target.closest('.nai-upload-zone');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('dragover');
    this.readFile(event.dataTransfer?.files?.[0]);
  }

  notify(type, message) { this.adapter.notify(type, message); }

  toggleDrawer(force) {
    if (!this.root) return;
    const drawer = document.querySelector('#novelai-wrapper');
    const open = force === undefined ? !this.root.classList.contains('openDrawer') : force;
    this.root.classList.toggle('openDrawer', open);
    drawer?.querySelector('#novelai-icon')?.classList.toggle('openIcon', open);
    drawer?.querySelector('#novelai-icon')?.classList.toggle('closedIcon', !open);
  }

  async handleClick(event) {
    const target = event.target.closest('[data-tab],[data-action]');
    if (!target) return;
    if (target.dataset.tab) {
      this.tab = target.dataset.tab;
      if (this.tab === 'overview' && !this.overviewChapterId) this.overviewChapterId = this.store.getProject()?.runtime?.currentStage?.chapterId || this.store.getProject()?.chapters?.[0]?.chapterId;
      this.render({ preserveScroll: false });
      return;
    }
    const action = target.dataset.action;
    try {
      if (action === 'close-panel') this.toggleDrawer(false);
      else if (action === 'toggle-section') { const key = target.dataset.id; if (this.collapsedSections.has(key)) this.collapsedSections.delete(key); else this.collapsedSections.add(key); this.render(); }
      else if (action === 'choose-file') this.root.querySelector('#nai-txt-file')?.click();
      else if (action === 'update-plugin') await this.updateSelfFromRepo();
      else if (action === 'capture') await this.capture();
      else if (action === 'preview-clean') await this.previewClean();
      else if (action === 'apply-clean') { const result = await this.store.applyCleanPreview(); this.notify('success', `\u5df2\u5220\u9664 ${result.deletedCount} \u5904\u91cd\u590d\u7247\u6bb5`); }
      else if (action === 'clean-impurities') await this.cleanImpurities();
      else if (action === 'toggle-chapter-source') { const id = Number(target.dataset.id); this.openChapterId = this.openChapterId === id ? null : id; this.render(); }
      else if (action === 'copy-chapter') await this.copyChapter(Number(target.dataset.id));
      else if (action === 'save-chapter') await this.saveChapter(Number(target.dataset.id));
      else if (action === 'confirm-chapter') await this.store.confirmChapter(Number(target.dataset.id));
      else if (action === 'merge-chapter') { if (await this.adapter.confirm('\u5408\u5e76\u7ae0\u8282', '\u5408\u5e76\u540e\u9700\u91cd\u65b0\u786e\u8ba4\u53d7\u5f71\u54cd\u8d44\u4ea7\uff0c\u7ee7\u7eed\u5417\uff1f')) await this.store.mergeChapter(Number(target.dataset.id), target.dataset.direction === 'previous' ? 'previous' : 'next'); }
      else if (action === 'delete-selected-chapters') await this.deleteSelectedChapters();
      else if (action === 'export-project') this.adapter.downloadJson(`novelai-project-${Date.now()}.json`, toProjectPackage(this.store.getProject()));
      else if (action === 'import-project') this.root.querySelector('#nai-txt-file')?.click();
      else if (action === 'reset-project') {
        if (await this.adapter.confirm('清空当前项目', '这会清除当前正文、章节和世界书状态，立即返回空白工作台。继续吗？')) {
          this.openChapterId = null;
          await this.store.resetProject();
          this.notify('info', '已返回空白项目状态');
        }
      }
      else if (action === 'preview-prompt') await this.previewPrompt();
      else if (action === 'extract-worldbook') await this.extractWorldbook();
      else if (action === 'cancel-job') this.notify(this.store.cancelActiveJob() ? 'info' : 'warning', this.store.isJobRunning() ? '\u5df2\u8bf7\u6c42\u53d6\u6d88\uff0c\u5df2\u5b8c\u6210\u7ae0\u8282\u4f1a\u4fdd\u7559' : '\u5f53\u524d\u6ca1\u6709\u53ef\u53d6\u6d88\u7684\u4efb\u52a1');
      else if (action === 'export-worldbook') { this.adapter.downloadJson(`novelai-worldbook-${Date.now()}.json`, toSillyTavernWorldbook(this.store.getProject().worldbookEntries)); await this.store.update((draft) => { draft.exports.lastWorldbookAt = Date.now(); draft.exports.exportVersion = (draft.exports.exportVersion || 0) + 1; return draft; }); }
      else if (action === 'export-card') await this.exportCard();
      else if (action === 'toggle-category') { this.toggleOpenId(this.openCategoryIds, target.dataset.id); this.render(); }
      else if (action === 'add-category') await this.addCategory();
      else if (action === 'toggle-light') await this.toggleEntry(target.dataset.id);
      else if (action === 'toggle-entry') { this.toggleOpenId(this.openEntryIds, target.dataset.id); this.render(); }
      else if (action === 'expand-all-entries') { (this.store.getProject()?.worldbookEntries || []).forEach((entry) => this.openEntryIds.add(entry.id)); this.render(); }
      else if (action === 'collapse-all-entries') { this.openEntryIds.clear(); this.render(); }
      else if (action === 'delete-entry') await this.deleteEntries([target.dataset.id]);
      else if (action === 'delete-selected-entries') await this.deleteEntries(this.selectedEntries());
      else if (action === 'merge-selected') await this.mergeSelected();
      else if (action === 'organize-selected') await this.organizeSelected();
      else if (action === 'parse-beats') { await this.store.runBeats(); this.notify('success', '\u8282\u62cd\u89e3\u6790\u5b8c\u6210'); }
      else if (action === 'reroll-beat') { await this.store.rerollBeat(Number(target.dataset.id)); this.notify('success', '\u672c\u7ae0\u8282\u62cd\u5df2\u91cd roll'); }
      else if (action === 'toggle-outline') { const body = this.root.querySelector(`[data-outline-body="${target.dataset.id}"]`); body?.classList.toggle('is-open'); target.classList.toggle('is-open'); }
      else if (action === 'view-overview') { this.overviewChapterId = Number(target.dataset.id); this.tab = 'overview'; this.render(); }
      else if (action === 'view-chapter') { this.overviewChapterId = Number(target.dataset.id); this.render(); }
      else if (action === 'jump-current-stage') { this.overviewChapterId = this.store.getProject()?.runtime?.currentStage?.chapterId || this.overviewChapterId; this.render(); }
      else if (action === 'start-chapter') { await this.store.startChapter(Number(target.dataset.id)); this.overviewChapterId = Number(target.dataset.id); this.notify('success', '\u6545\u4e8b\u5750\u6807\u5df2\u8bbe\u7f6e'); }
      else if (action === 'previous-beat') await this.store.shiftBeat(-1);
      else if (action === 'next-beat') await this.store.shiftBeat(1);
      else if (action === 'edit-beat') await this.editBeat(target.dataset.id);
      else if (action === 'edit-story-summary') await this.editStorySummary();
      else if (action === 'merge-beat') await this.mergeBeat(target.dataset.id, target.dataset.direction);
      else if (action === 'move-beat-order') await this.moveBeatOrder(target.dataset.id, Number(target.dataset.direction));
      else if (action === 'delete-beat') await this.deleteBeat(target.dataset.id);
      else if (action === 'save-settings') this.saveSettings();
      else if (action === 'list-models') await this.listModels(target.dataset.role, target);
      else if (action === 'test-api') await this.testApi(target.dataset.role, target);
    } catch (error) {
      this.logger?.error('\u754c\u9762\u64cd\u4f5c\u5931\u8d25', { action, error: error.message });
      this.notify('error', error.message);
    }
  }

  async capture() {
    this.openChapterId = null;
    const result = await this.store.capture(this.root.querySelector('#nai-chapter-regex')?.value);
    const el = this.root.querySelector('#nai-capture-result');
    if (el) el.textContent = result.errors?.length ? `\u274c ${result.errors.join('\uff1b')}` : `\u2705 \u68c0\u6d4b\u5230 ${result.chapters.length} \u4e2a\u7ae0\u8282`;
  }

  async previewClean() {
    const project = this.store.getProject();
    if (!String(project?.sourceText || '').trim()) throw new Error('\u8bf7\u5148\u5bfc\u5165 TXT');
    const result = await this.store.cleanPreviewText(this.root.querySelector('#nai-clean-patterns')?.value || '');
    if (!result.patterns.length) throw new Error('\u8bf7\u5148\u8f93\u5165\u81f3\u5c11\u4e00\u4e2a\u5f85\u5220\u7247\u6bb5');
    const summary = summarizeCleanPreview(result, { sourceText: project.sourceText, chapters: project.chapters });
    const feedback = this.root.querySelector('#nai-clean-result');
    if (feedback) { feedback.innerHTML = renderCleanPreviewSummary(summary); feedback.hidden = false; }
    const button = this.root.querySelector('[data-action="apply-clean"]');
    if (button) { button.disabled = !result.count; button.textContent = result.count ? `\ud83e\uddf9 \u6267\u884c\u5220\u9664\uff08${result.count} \u5904\uff09` : '\ud83e\uddf9 \u6267\u884c\u5220\u9664'; }
  }

  async extractWorldbook() {
    const job = this.store.runWorldbook();
    this.render();
    try {
      const result = await job;
      const succeeded = result.results.filter((item) => item.status === 'succeeded').length;
      const failed = result.results.filter((item) => item.status === 'failed').length;
      this.notify(failed ? 'warning' : 'success', `\u4e16\u754c\u4e66\u63d0\u53d6\u5b8c\u6210\uff1a${succeeded} \u7ae0\u6210\u529f${failed ? `\uff0c${failed} \u7ae0\u5931\u8d25` : ''}`);
    } finally {
      this.render();
    }
  }

  toggleOpenId(set, id) { if (set.has(id)) set.delete(id); else set.add(id); }

  async cleanImpurities() { if (await this.adapter.confirm('\u5220\u9664\u6742\u8d28', '\u5c06\u5220\u9664\u7ae0\u8282\u5916\u5185\u5bb9\u53ca\u660e\u663e\u5e7f\u544a\uff0c\u7ee7\u7eed\u5417\uff1f')) { const result = await this.store.cleanImpurities(); this.notify('success', `\u5df2\u5904\u7406 ${result.removed.length} \u5904\u7591\u4f3c\u6742\u8d28`); } }
  async previewPrompt() { const { buildPromptPreview } = await import('../domain/worldbook/prompts.js'); await this.adapter.confirm('\u63d0\u793a\u8bcd\u9884\u89c8', buildPromptPreview(this.store.getProject().categoryConfigs).slice(0, 6000)); }
  async copyChapter(id) {
    const chapter = this.store.getProject()?.chapters?.find((item) => item.chapterId === id);
    if (!chapter) throw new Error('\u7ae0\u8282\u4e0d\u5b58\u5728');
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u526a\u8d34\u677f');
    await globalThis.navigator.clipboard.writeText(chapter.text);
    this.notify('success', '\u7ae0\u8282\u539f\u6587\u5df2\u590d\u5236');
  }

  async saveChapter(id) {
    const chapter = this.store.getProject()?.chapters?.find((item) => item.chapterId === id);
    if (!chapter) throw new Error('\u7ae0\u8282\u4e0d\u5b58\u5728');
    const chapterName = this.root.querySelector(`[data-chapter-name="${id}"]`)?.value ?? chapter.chapterName;
    const text = this.root.querySelector(`[data-chapter-editor="${id}"]`)?.value ?? chapter.text;
    if (chapterName === chapter.chapterName && text === chapter.text) {
      this.notify('info', '\u7ae0\u8282\u5185\u5bb9\u6ca1\u6709\u53d8\u5316');
      return;
    }
    await this.store.editChapter(id, { chapterName, text });
    this.openChapterId = id;
    this.notify('success', '\u7ae0\u8282\u4fee\u6539\u5df2\u4fdd\u5b58');
  }
  async deleteSelectedChapters() { const ids = this.selectedChapters(); if (ids.length && await this.adapter.confirm('\u5220\u9664\u7ae0\u8282', `\u786e\u8ba4\u5220\u9664 ${ids.length} \u4e2a\u7ae0\u8282\uff1f`)) await this.store.deleteChapter(ids); }
  selectedEntries() { return [...this.root.querySelectorAll('[data-select-entry]:checked')].map((el) => el.dataset.selectEntry); }
  selectedChapters() { return [...this.root.querySelectorAll('[data-select-chapter]:checked')].map((el) => Number(el.dataset.selectChapter)); }
  async addCategory() { const name = prompt('\u65b0\u7c7b\u522b\u540d\u79f0'); if (name?.trim()) await this.store.update((draft) => { draft.categoryConfigs.push({ id: `category_${Date.now()}`, name: name.trim(), enabled: true, fields: ['\u540d\u79f0', '\u5173\u952e\u8bcd'], prompt: '\u8bf7\u6839\u636e\u539f\u6587\u63d0\u53d6\u8be5\u7c7b\u522b\u4fe1\u606f\u3002', defaultConfig: { position: 'before_char', depth: 4, order: 300, autoIncrementOrder: true } }); return draft; }); }
  async toggleEntry(id) { await this.store.update((draft) => { const entry = draft.worldbookEntries.find((item) => item.id === id); if (entry) entry.constant = !entry.constant; return draft; }); }
  async deleteEntries(ids) { if (ids.length && await this.adapter.confirm('\u5220\u9664\u6761\u76ee', `\u786e\u8ba4\u5220\u9664 ${ids.length} \u4e2a\u6761\u76ee\uff1f`)) await this.store.update((draft) => { draft.worldbookEntries = draft.worldbookEntries.filter((entry) => !ids.includes(entry.id)); return draft; }); }
  async mergeSelected() { const ids = this.selectedEntries(); if (ids.length < 2) throw new Error('\u81f3\u5c11\u9009\u62e9\u4e24\u4e2a\u6761\u76ee'); const { mergeSelectedEntries } = await import('../domain/worldbook/mergeEntry.js'); const name = prompt('\u5408\u5e76\u540e\u540d\u79f0\uff08\u53ef\u7559\u7a7a\uff09') || ''; await this.store.update((draft) => { draft.worldbookEntries = mergeSelectedEntries(draft.worldbookEntries, ids, { name }); return draft; }); }
  async organizeSelected() { const ids = this.selectedEntries(); if (!ids.length) throw new Error('\u8bf7\u5148\u9009\u62e9\u6761\u76ee'); for (const id of ids) { const entry = this.store.getProject().worldbookEntries.find((item) => item.id === id); const result = await this.apiRouter.generate({ role: 'actor', prompt: `\u8bf7\u6574\u7406\u4ee5\u4e0b\u4e16\u754c\u4e66\u5185\u5bb9\uff0c\u53bb\u9664\u91cd\u590d\u4fe1\u606f\uff0c\u76f4\u63a5\u8f93\u51fa Markdown\uff1a\n${entry.content}` }); if (result.text?.trim()) await this.store.update((draft) => { draft.worldbookEntries.find((item) => item.id === id).content = result.text.trim(); return draft; }); } }
  async exportCard() { const project = this.store.getProject(); const name = project.chapters?.[0]?.chapterName || 'NovelAI'; const card = toCharacterCard(project.worldbookEntries, { name, projectId: project.projectId, schemaVersion: project.schemaVersion }); const wrote = await this.adapter.writeCharacterExtension({ schemaVersion: project.schemaVersion, projectId: project.projectId, worldbook: card.data.character_book }); this.adapter.downloadJson(`novelai-character-card-${Date.now()}.json`, card); await this.store.update((draft) => { draft.exports.lastCharacterCardAt = Date.now(); return draft; }); this.notify(wrote ? 'success' : 'warning', wrote ? '\u5df2\u5bfc\u51fa\u89d2\u8272\u5361\uff0c\u8bf7\u5bfc\u5165\u540e\u5f00\u59cb\u804a\u5929' : '\u5df2\u5bfc\u51fa\u72ec\u7acb\u89d2\u8272\u5361'); }
  async editBeat(beatId) { const project = this.store.getProject(); const asset = project.beatAssets.find((item) => item.chapterId === this.overviewChapterId); const beat = asset?.beats.find((item) => item.beatId === beatId); if (!beat) return; const summary = prompt('\u4e8b\u4ef6\u6458\u8981', beat.summary); const exitCondition = summary === null ? null : prompt('\u9000\u51fa\u6761\u4ef6', beat.exitCondition); const text = exitCondition === null ? null : prompt('\u8282\u62cd\u539f\u6587', beat.text); if (text === null) return; const { updateBeatAsset } = await import('../domain/beats/mutateBeats.js'); await this.store.update((draft) => { const index = draft.beatAssets.findIndex((item) => item.chapterId === this.overviewChapterId); draft.beatAssets[index] = updateBeatAsset(draft.chapters.find((item) => item.chapterId === this.overviewChapterId), draft.beatAssets[index], beatId, { summary, exitCondition, text }); return draft; }); }
  async editStorySummary() { const asset = this.store.getProject().beatAssets.find((item) => item.chapterId === this.overviewChapterId); const summary = prompt('\u6545\u4e8b\u6458\u8981', asset?.summary || ''); if (summary !== null) await this.store.update((draft) => { draft.beatAssets.find((item) => item.chapterId === this.overviewChapterId).summary = summary; return draft; }); }
  async mergeBeat(beatId, direction) { const asset = this.store.getProject().beatAssets.find((item) => item.chapterId === this.overviewChapterId); if (!asset || asset.beats.length <= 2) throw new Error('\u6bcf\u7ae0\u81f3\u5c11\u4fdd\u7559\u4e24\u4e2a\u8282\u62cd'); if (await this.adapter.confirm('\u5408\u5e76\u8282\u62cd', '\u5408\u5e76\u540e\u5c06\u91cd\u65b0\u7f16\u53f7\uff0c\u7ee7\u7eed\u5417\uff1f')) { const { mergeAdjacentBeatAsset } = await import('../domain/beats/mutateBeats.js'); await this.store.update((draft) => { const index = draft.beatAssets.findIndex((item) => item.chapterId === this.overviewChapterId); draft.beatAssets[index] = mergeAdjacentBeatAsset(draft.chapters.find((item) => item.chapterId === this.overviewChapterId), draft.beatAssets[index], beatId, direction); draft.runtime.currentStage = null; return draft; }); } }
  async moveBeatOrder(beatId, direction) { const { moveBeatAsset } = await import('../domain/beats/mutateBeats.js'); await this.store.update((draft) => { const index = draft.beatAssets.findIndex((item) => item.chapterId === this.overviewChapterId); draft.beatAssets[index] = moveBeatAsset(draft.chapters.find((item) => item.chapterId === this.overviewChapterId), draft.beatAssets[index], beatId, direction); draft.runtime.currentStage = null; return draft; }); }
  async deleteBeat(beatId) { const asset = this.store.getProject().beatAssets.find((item) => item.chapterId === this.overviewChapterId); if (!asset || asset.beats.length <= 2) throw new Error('\u6bcf\u7ae0\u81f3\u5c11\u4fdd\u7559\u4e24\u4e2a\u8282\u62cd'); if (await this.adapter.confirm('\u5220\u9664\u8282\u62cd', '\u5220\u9664\u540e\u9700\u8981\u91cd\u65b0\u9009\u62e9\u5750\u6807\uff0c\u7ee7\u7eed\u5417\uff1f')) await this.store.update((draft) => { const target = draft.beatAssets.find((item) => item.chapterId === this.overviewChapterId); target.beats = target.beats.filter((item) => item.beatId !== beatId).map((item, index) => ({ ...item, beatId: `b${index + 1}`, order: index })); draft.runtime.currentStage = null; return draft; }); }
  saveSettings({ notify = true } = {}) {
    const settings = this.settingsStore.load();
    settings.enabled = !!this.root.querySelector('#nai-enabled')?.checked;
    settings.useTavernApi = !!this.root.querySelector('#nai-use-tavern')?.checked;
    settings.maxConcurrency = Math.min(8, Math.max(1, Number(this.root.querySelector('#nai-concurrency')?.value) || 1));
    for (const role of ['actor', 'director']) {
      const keyInput = this.root.querySelector(`[data-api-key="${role}"]`);
      if (keyInput) this.settingsStore.setApiKey(role, keyInput.value);
      for (const key of ['provider', 'endpoint', 'model', 'maxTokens', 'timeoutMs', 'maxRetries', 'stream']) {
        const el = this.root.querySelector(`[data-api="${role}"][data-key="${key}"]`);
        if (el) settings[role][key] = key === 'stream' ? el.checked : ['maxTokens', 'timeoutMs', 'maxRetries'].includes(key) ? Number(el.value) || 0 : el.value;
      }
    }
    this.settingsStore.save(settings);
    const status = this.root.querySelector('#nai-settings-status');
    if (status) { status.textContent = '\u2705 \u8bbe\u7f6e\u5df2\u4fdd\u5b58'; status.className = 'nai-model-status success'; }
    if (notify) this.notify('success', '\u8bbe\u7f6e\u5df2\u4fdd\u5b58');
    return settings;
  }

  setModelStatus(role, text, type = '') {
    const status = this.root.querySelector(`[data-model-status="${role}"]`);
    if (status) { status.textContent = text; status.className = `nai-model-status ${type}`.trim(); }
  }

  async listModels(role, button) {
    const settings = this.saveSettings({ notify: false });
    if (settings.useTavernApi) {
      this.setModelStatus(role, '\u9152\u9986 API \u4f7f\u7528\u5f53\u524d\u9152\u9986\u6a21\u578b\uff0c\u65e0\u9700\u62c9\u53d6\u5217\u8868', 'info');
      return;
    }
    const oldText = button.textContent;
    button.disabled = true; button.textContent = '\u23f3 \u62c9\u53d6\u4e2d...';
    this.setModelStatus(role, '\u6b63\u5728\u62c9\u53d6\u6a21\u578b\u5217\u8868...', 'loading');
    try {
      const models = await this.apiRouter.listModels(role);
      const select = this.root.querySelector(`[data-model-select="${role}"]`);
      const wrap = this.root.querySelector(`[data-model-select-wrap="${role}"]`);
      if (!models.length) { if (wrap) wrap.hidden = true; this.setModelStatus(role, '\u274c \u672a\u62c9\u53d6\u5230\u6a21\u578b', 'error'); return; }
      if (select) {
        select.innerHTML = '<option value="">\u8bf7\u9009\u62e9\u6a21\u578b</option>';
        const documentRef = this.root.ownerDocument || globalThis.document;
        for (const model of models) { const option = documentRef.createElement('option'); option.value = model; option.textContent = model; select.appendChild(option); }
      }
      if (wrap) wrap.hidden = false;
      this.setModelStatus(role, `\u2705 \u627e\u5230 ${models.length} \u4e2a\u6a21\u578b\uff0c\u8bf7\u4ece\u5217\u8868\u9009\u62e9`, 'success');
    } catch (error) {
      this.setModelStatus(role, `\u274c ${error.message}`, 'error');
      throw error;
    } finally { button.disabled = false; button.textContent = oldText; }
  }

  async testApi(role, button) {
    this.saveSettings({ notify: false });
    const oldText = button.textContent;
    const startedAt = performance.now();
    button.disabled = true; button.textContent = '\u23f3 \u6d4b\u8bd5\u4e2d...';
    this.setModelStatus(role, '\u6b63\u5728\u6d4b\u8bd5\u8fde\u63a5...', 'loading');
    try {
      const result = await this.apiRouter.generate({ role, prompt: 'Reply with OK.' });
      const elapsed = Math.round(performance.now() - startedAt);
      const preview = String(result.text || '').trim().slice(0, 60);
      this.setModelStatus(role, `\u2705 \u6d4b\u8bd5\u6210\u529f\uff08${elapsed} ms\uff09${preview ? `\uff1a${preview}` : ''}`, 'success');
    } catch (error) {
      this.setModelStatus(role, `\u274c ${error.message}`, 'error');
      throw error;
    } finally { button.disabled = false; button.textContent = oldText; }
  }

  async handleChange(event) {
    const el = event.target;
    if (el.dataset.categoryEnabled) await this.store.update((draft) => { const category = draft.categoryConfigs.find((item) => item.id === el.dataset.categoryEnabled); if (category) category.enabled = el.checked; return draft; });
    if (el.dataset.categoryPrompt) await this.store.update((draft) => { const category = draft.categoryConfigs.find((item) => item.id === el.dataset.categoryPrompt); if (category) category.prompt = el.value; return draft; });
    if (el.dataset.entryContent) await this.store.update((draft) => { const entry = draft.worldbookEntries.find((item) => item.id === el.dataset.entryContent); if (entry) entry.content = el.value; return draft; });
    if (el.dataset.apiKey) this.settingsStore.setApiKey(el.dataset.apiKey, el.value);
    if (el.dataset.modelSelect) {
      const input = this.root.querySelector(`[data-api="${el.dataset.modelSelect}"][data-key="model"]`);
      if (input) input.value = el.value;
      this.saveSettings({ notify: false });
      this.setModelStatus(el.dataset.modelSelect, `\u5df2\u9009\u62e9\u6a21\u578b\uff1a${el.value}`, 'success');
    }
  }

  handleInput(event) {
    if (event.target.id !== 'nai-clean-patterns') return;
    const result = this.root.querySelector('#nai-clean-result');
    if (result) { result.hidden = true; result.innerHTML = ''; }
    const button = this.root.querySelector('[data-action="apply-clean"]');
    if (button) { button.disabled = true; button.textContent = '\ud83e\uddf9 \u6267\u884c\u5220\u9664'; }
  }

  async updateSelfFromRepo() {
    if (this.updateInProgress) return;
    this.updateInProgress = true;
    this.render();
    try {
      const result = await updateExtensionFromRepo({
        repoUrl: NOVELAI_REPO_URL,
        currentFolder: getExtensionFolderName(),
        getRequestHeaders: () => this.adapter.getRequestHeaders(),
      });
      if (result.mode === 'install') {
        this.notify('success', '插件安装完成，将重新加载 SillyTavern');
      } else if (result.isUpToDate) {
        this.notify('success', '插件已是最新版本');
        return;
      } else {
        const commit = result.shortCommitHash ? `（${result.shortCommitHash}）` : '';
        this.notify('success', `插件更新成功${commit}，将重新加载 SillyTavern`);
      }
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        setTimeout(() => window.location.reload(), 700);
      }
    } finally {
      this.updateInProgress = false;
      this.render();
    }
  }
}
