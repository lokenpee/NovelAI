import { DEFAULT_DIRECTOR_PROMPT, buildActorExecution, buildDirectorPrompt } from '../../domain/runtime/prompts.js';
import { commitActorTurn, findBeat } from '../../domain/runtime/stageState.js';
import { normalizeDirectorDecision } from '../../domain/runtime/directorDecision.js';

const INJECT_MARKER = '\u2063NOVELAI_EXECUTION\u2063';
const OPENING_MARKER = '\u2063NOVELAI_OPENING\u2063';

export class RuntimeController {
  constructor({ getProject, updateProject, settingsStore, apiRouter, adapter, logger } = {}) {
    this.getProject = getProject; this.updateProject = updateProject; this.settingsStore = settingsStore; this.apiRouter = apiRouter; this.adapter = adapter; this.logger = logger; this.locked = false; this.pending = null;
  }
  async intercept(chat, contextSize, abort, type) {
    const settings = this.settingsStore.load();
    if (!settings.enabled || !Array.isArray(chat) || type === 'quiet' || this.locked) return;
    const project = this.getProject(); const runtime = project?.runtime; const stage = runtime?.currentStage;
    if (!project || !stage) return;
    const { chapterAsset, beat } = findBeat(project.beatAssets, stage);
    if (!chapterAsset || !beat) return;
    const context = this.adapter.getContext();
    if (context.characterId === undefined && !context.groupId) return;
    if (!(project.worldbookEntries || []).length) return;
    const character = context.characterId === undefined ? null : context.characters?.[context.characterId];
    const characterProjectId = character?.data?.extensions?.novelai_project?.projectId;
    const hasMatchingCharacterProject = characterProjectId === project.projectId;
    if (!hasMatchingCharacterProject && !project.exports?.lastWorldbookAt && !project.exports?.lastCharacterCardAt) return;
    this.locked = true;
    try {
      removeInjectedExecution(chat);
      const recentUser = tailSentences([...chat].reverse().find((message) => message?.is_user)?.mes || runtime.lastUserInput || '');
      const recentAssistant = runtime.isNewbeat ? beat.opening : tailSentences(runtime.recentAssistantTail || '');
      const nextBeat = chapterAsset.beats[beat.order + 1];
      const prompt = buildDirectorPrompt({ chapterName: chapterAsset.chapterName, summary: chapterAsset.summary, chapterId: stage.chapterId, beatId: beat.beatId, stageIdx: [stage.chapterId, beat.beatId], eventSummary: beat.summary, exitCondition: beat.exitCondition, beatText: beat.text, nextBeatPreview: nextBeat?.opening || '', recentAssistant, recentUserInput: recentUser, directorHistory: (runtime.directorHistory || []).slice(-3).map((item) => `[${item.director_index}] ${item.direction_script.action_chain}`).join('\n'), startAnchor: recentAssistant, contextMode: '常规推进' }, settings.directorPrompt || DEFAULT_DIRECTOR_PROMPT);
      const response = await this.apiRouter.generate({ role: 'director', prompt });
      const directorIndex = (runtime.directorIndex || 0) + 1;
      const decision = normalizeDirectorDecision(response.text, stage, directorIndex);
      const execution = buildActorExecution({ startAnchor: recentAssistant, decision, chapterName: chapterAsset.chapterName, summary: chapterAsset.summary, beatId: beat.beatId, eventSummary: beat.summary, exitCondition: beat.exitCondition, beatText: beat.text, nextBeatPreview: nextBeat?.opening || '' }, settings.actorPrompt || undefined);
      injectExecution(chat, `${INJECT_MARKER}\n${execution}`);
      if (runtime.isNewchapter && runtime.openingSentForStage !== `${stage.chapterId}:${stage.beatId}` && chapterAsset.opening) injectOpening(chat, `${OPENING_MARKER}\n本章开场：${chapterAsset.opening}`);
      this.pending = { projectId: project.projectId, decision, stage, requestType: type, startedAt: Date.now() };
      await this.updateProject((next) => ({ ...next, runtime: { ...next.runtime, pendingDecision: decision, directorIndex, directorHistory: [...(next.runtime.directorHistory || []), decision].slice(-20), lastUserInput: recentUser } }));
      this.logger?.info('导演请求完成', { projectId: project.projectId, chapterId: stage.chapterId, beatId: stage.beatId, directorIndex });
    } catch (error) {
      this.logger?.warn('导演请求失败，保持原生生成', { error: error.message, type });
      removeInjectedExecution(chat); abort?.(false);
    } finally { this.locked = false; }
  }
  async onMessageReceived(data, type = '') {
    const project = this.getProject(); const pending = this.pending;
    if (!project || !pending || pending.projectId !== project.projectId) return;
    const contextMessage = Number.isInteger(data) ? this.adapter.getChat()?.[data] : data;
    if (contextMessage?.is_user) return;
    const message = typeof contextMessage === 'string' ? contextMessage : contextMessage?.mes || contextMessage?.message || contextMessage?.text || '';
    if (!String(message).trim()) return;
    await this.updateProject((next) => ({ ...next, runtime: commitActorTurn(next.runtime, next.beatAssets, message, pending.decision) }));
    this.pending = null;
    try { await this.adapter.saveMetadata(); } catch { /* metadata persistence is best effort */ }
  }
  onGenerationEnded() { this.locked = false; }
  onChatChanged() { this.locked = false; this.pending = null; }
}

function removeInjectedExecution(chat) {
  for (let index = chat.length - 1; index >= 0; index -= 1) if (String(chat[index]?.mes || '').includes(INJECT_MARKER) || String(chat[index]?.mes || '').includes(OPENING_MARKER)) chat.splice(index, 1);
}
function injectExecution(chat, text) { chat.unshift({ is_user: false, name: 'NovelAI Director', send_date: Date.now(), mes: text }); }
function injectOpening(chat, text) { chat.unshift({ is_user: false, name: 'NovelAI Opening', send_date: Date.now(), mes: text }); }

export { INJECT_MARKER, OPENING_MARKER, removeInjectedExecution };

function tailSentences(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 100) return text;
  const parts = text.split(/(?<=[。！？!?；;])\s*/u).filter(Boolean);
  return (parts.length > 1 ? parts.slice(-2).join('') : text.slice(-100)).slice(-100);
}
