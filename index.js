import { AppStore } from './src/services/state/appStore.js';
import { ProjectStore } from './src/services/storage/projectStore.js';
import { SettingsStore } from './src/services/storage/settingsStore.js';
import { Logger } from './src/services/logging/logger.js';
import { ApiRouter } from './src/services/api/apiRouter.js';
import { SillyTavernAdapter } from './src/services/platform/sillyTavernAdapter.js';
import { RuntimeController } from './src/services/runtime/runtimeController.js';
import { NovelAiPanel } from './src/ui/panel.js';
import { validateStage } from './src/domain/runtime/stageState.js';

const logger = new Logger();
const adapter = new SillyTavernAdapter();
const context = adapter.getContext();
const settingsStore = new SettingsStore(() => adapter.getContext());
settingsStore.load();
const projectStore = new ProjectStore({ localforage: context.libs?.localforage });
const apiRouter = new ApiRouter({ contextProvider: () => adapter.getContext(), settingsStore, logger });
const store = new AppStore({ projectStore, apiRouter, settingsStore, logger });
const runtime = new RuntimeController({ getProject: () => store.getProject(), updateProject: (mutator) => store.update(mutator), settingsStore, apiRouter, adapter, logger });
const panel = new NovelAiPanel({ store, settingsStore, apiRouter, adapter, logger });

globalThis.novelAiGenerateInterceptor = async (chat, contextSize, abort, type) => runtime.intercept(chat, contextSize, abort, type);
globalThis.__novelAi = { adapter, settingsStore, projectStore, apiRouter, store, runtime, panel };

let initialized = false;
let disposers = [];
let metadataUnsubscribe = null;

export async function onActivate() {
  if (initialized) return;
  initialized = true;
  settingsStore.load();
  bindProjectMetadataSync();
  disposers.push(adapter.on('MESSAGE_SENT', (data) => {
    const message = Number.isInteger(data) ? adapter.getChat()[data] : data;
    const text = typeof message === 'string' ? message : message?.mes || message?.message || '';
    if (!store.getProject() || !text) return;
    store.update((draft) => { draft.runtime.lastUserInput = String(text); return draft; }).catch((error) => logger.warn('记录用户输入失败', { error: error.message }));
  }));
  disposers.push(adapter.on('MESSAGE_RECEIVED', (messageId, type) => runtime.onMessageReceived(messageId, type).catch((error) => logger.warn('提交演员回合失败', { error: error.message }))));
  disposers.push(adapter.on('GENERATION_ENDED', () => runtime.onGenerationEnded()));
  disposers.push(adapter.on('CHAT_CHANGED', () => { runtime.onChatChanged(); return restoreChatState(); }));
  disposers.push(adapter.on('APP_INITIALIZED', () => initializeAsync({ mount: true }).catch((error) => logger.error('UI 挂载失败', { error: error.message }))));
  disposers.push(adapter.on('APP_READY', () => initializeAsync({ mount: true }).catch((error) => logger.error('异步初始化失败', { error: error.message }))));
  await initializeAsync();
}

export function onDisable() {
  for (const dispose of disposers) dispose();
  disposers = [];
  metadataUnsubscribe?.();
  metadataUnsubscribe = null;
  panel.destroy();
  initialized = false;
}

async function initializeAsync({ mount = false } = {}) {
  if (!store.getProject()) {
    try { await store.init(); } catch (error) { adapter.notify('error', error.message); }
  }
  await restoreChatState();
  if (mount) await panel.mount();
}

async function restoreChatState() {
  const project = store.getProject(); if (!project) return;
  const metadata = adapter.getChatMetadata(); const saved = metadata?.novelai?.[project.projectId];
  if (saved?.currentStage) {
    try {
      await store.update((draft) => {
        if (!validateStage(draft.beatAssets, saved.currentStage)) { draft.runtime.currentStage = null; draft.runtime.stageChangeReason = 'restored_stage_invalid'; return draft; }
        draft.runtime = { ...draft.runtime, ...saved };
        return draft;
      });
    } catch (error) { logger.warn('恢复聊天坐标失败', { error: error.message }); }
  }
}

function bindProjectMetadataSync() {
  if (metadataUnsubscribe) return;
  metadataUnsubscribe = store.subscribe((project) => {
    const metadata = adapter.getChatMetadata();
    if (metadata) { metadata.novelai = metadata.novelai || {}; metadata.novelai[project.projectId] = { currentStage: project.runtime.currentStage, recentAssistantTail: project.runtime.recentAssistantTail, directorHistory: project.runtime.directorHistory, openingSentForStage: project.runtime.openingSentForStage }; adapter.saveMetadata().catch(() => {}); }
  });
}

if (globalThis.SillyTavern?.getContext) onActivate().catch((error) => logger.error('NovelAI 激活失败', { error: error.message }));

export { store, runtime, panel, settingsStore, apiRouter };
