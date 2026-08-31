import test from 'node:test';
import assert from 'node:assert/strict';
import { previewClean, applyClean, removeImpurities } from '../src/domain/text/cleanText.js';
import { captureChapters } from '../src/domain/chapter/captureChapters.js';
import { normalizeName, normalizeEntry } from '../src/domain/worldbook/normalizeEntry.js';
import { mergeEntry, mergeSelectedEntries } from '../src/domain/worldbook/mergeEntry.js';
import { parseExtractionResponse } from '../src/domain/worldbook/parseExtractionResponse.js';
import { normalizeBeats } from '../src/domain/beats/normalizeBeats.js';
import { createProject } from '../src/domain/project/createProject.js';
import { validateProject } from '../src/domain/project/validateProject.js';
import { setStage, moveBeat, commitActorTurn } from '../src/domain/runtime/stageState.js';
import { normalizeDirectorDecision } from '../src/domain/runtime/directorDecision.js';
import { toSillyTavernWorldbook, toCharacterCard } from '../src/domain/worldbook/exportWorldbook.js';
import { ApiRouter } from '../src/services/api/apiRouter.js';
import { runWorldbookJob } from '../src/services/jobs/worldbookJob.js';
import { runBeatJob } from '../src/services/jobs/beatJob.js';
import { updateBeatAsset, mergeAdjacentBeatAsset, moveBeatAsset } from '../src/domain/beats/mutateBeats.js';
import { RuntimeController } from '../src/services/runtime/runtimeController.js';
import { invalidateChapterAssets } from '../src/domain/project/invalidateChapterAssets.js';
import { buildDirectorPrompt } from '../src/domain/runtime/prompts.js';
import { migrateProject } from '../src/domain/project/migrateProject.js';
import { ApiRequestError, withRateLimitRetry } from '../src/services/api/retryPolicy.js';
import { readSseResponse } from '../src/services/api/responseParsers.js';
import { ProjectStore } from '../src/services/storage/projectStore.js';
import { SettingsStore } from '../src/services/storage/settingsStore.js';

test('clean preview/apply is exact and version-sensitive', () => {
  const source = '第一章\n广告\n正文'; const preview = previewClean(source, '广告');
  assert.equal(preview.count, 1); assert.equal(applyClean(source, preview).text, '第一章\n\n正文');
  assert.throws(() => applyClean(`${source}!`, preview), /原文已变化/);
});

test('impurity cleanup keeps uncertain lines for manual review', () => {
  const result = removeImpurities('作者说明\n第一章\n正文\n作者：待确认\n本章完', '^第[一二]章');
  assert.match(result.text, /作者：待确认/); assert.equal(result.removed.length, 2); assert.equal(result.pending.length, 1);
});

test('capture chapters preserves title and rejects duplicates', () => {
  const source = '第一章 开始\n甲\n第二章 继续\n乙'; const result = captureChapters(source, '^第[一二]章[^\\n]*');
  assert.equal(result.errors.length, 0); assert.equal(result.chapters.length, 2); assert.equal(result.chapters[0].text, '第一章 开始\n甲');
  const duplicate = captureChapters('第一章 A\n第一章 A\nx', '^第一章[^\\n]*'); assert.match(duplicate.errors[0], /重复/);
});

test('entry normalization and deterministic merge', () => {
  assert.equal(normalizeName('第三卷 林晚舟（新版）'), '林晚舟');
  const config = { name: '角色', fields: ['真实姓名', '性格'], defaultConfig: { position: 'before_char', depth: 4, order: 100 } };
  const one = normalizeEntry({ 关键词: ['林晚舟'], 内容: '**性格**: 冷静' }, config, { name: '林晚舟', sourceChapterIds: [1] });
  const two = normalizeEntry({ 关键词: ['晚舟', '林晚舟'], 内容: '**性格**: 坚韧' }, config, { name: '林晚舟（新版）', sourceChapterIds: [2] });
  const merged = mergeEntry([one], two); assert.equal(merged.length, 1); assert.deepEqual(merged[0].keywords, ['林晚舟', '晚舟']); assert.match(merged[0].content, /冷静/); assert.match(merged[0].content, /坚韧/);
  assert.equal(mergeSelectedEntries([one, two], [one.id, two.id]).length, 1);
});

test('extraction response strips fences and unknown categories', () => {
  const configs = [{ name: '角色', enabled: true, fields: ['真实姓名', '性格'], defaultConfig: { position: 'before_char', depth: 4, order: 100 } }];
  const items = parseExtractionResponse('```json\n{"角色":{"林晚舟":{"关键词":["林晚舟"],"内容":"**性格**: 冷静"}},"未知":{}}\n```', configs, 1);
  assert.equal(items.length, 1); assert.equal(items[0].sourceChapterIds[0], 1);
});

test('beat boundary and stage transitions', () => {
  const chapter = { chapterId: 1, chapterName: '第一章', text: '开头。中间。结尾。', sourceVersion: 1 };
  const parsed = { summary: '摘要', beats: [{ summary: 'a', exitCondition: 'x', text: '开头。' }, { summary: 'b', exitCondition: 'y', text: '中间。结尾。' }] };
  const normalized = normalizeBeats(chapter, parsed); assert.equal(normalized.errors.length, 0); const assets = [normalized.asset];
  let runtime = setStage({ currentStage: null }, assets, { chapterId: 1, beatId: 'b1' }); assert.equal(runtime.isNewbeat, true); runtime = commitActorTurn(runtime, assets, '回复。', { will_complete_this_turn: true }); assert.equal(runtime.currentStage.beatId, 'b2'); assert.equal(runtime.isNewbeat, true); runtime = moveBeat(runtime, assets, -1); assert.equal(runtime.currentStage.beatId, 'b1');
});

test('director response is normalized and system stage wins', () => {
  const decision = normalizeDirectorDecision('{"stage_idx":[99,"b9"],"conflict_level":"bad","will_complete_this_last_turn":true,"direction_script":{"action_chain":"a→b→c"}}', { chapterId: 1, beatId: 'b1' }, 4);
  assert.deepEqual(decision.stage_idx, [1, 'b1']); assert.equal(decision.conflict_level, 'normal'); assert.equal(decision.will_complete_this_turn, true); assert.equal(decision.director_index, 4);
});

test('empty project satisfies schema', () => { assert.deepEqual(validateProject(createProject('正文')), []); });

test('SillyTavern export keeps light, position, depth and order fields', () => {
  const data = toSillyTavernWorldbook([{ id: 'e1', category: '角色', name: '林晚舟', keywords: ['林晚舟'], content: '**性格**: 冷静', constant: true, position: 'depth', depth: 8, order: 12 }]);
  const entry = data.entries['0']; assert.equal(entry.constant, true); assert.equal(entry.selective, false); assert.deepEqual(entry.key, ['林晚舟']); assert.equal(entry.position, 4); assert.equal(entry.extensions.depth, 8); assert.equal(entry.order, 12); const card = toCharacterCard([ { id: 'e1', category: '角色', name: '林晚舟', keywords: ['林晚舟'], content: '内容', constant: false, position: 'before_char', depth: 4, order: 1 } ], { name: '测试' }); assert.equal(card.spec, 'chara_card_v2'); assert.deepEqual(card.data.character_book.entries[0].keys, ['林晚舟']);
});

test('custom API router builds provider-specific requests', () => {
  const settings = { load: () => ({ useTavernApi: false, actor: { provider: 'anthropic', endpoint: 'https://x/v1', model: 'm', maxTokens: 10 } }), getApiKey: () => 'k' };
  const router = new ApiRouter({ settingsStore: settings });
  const request = router.buildRequest('anthropic', 'https://x/v1', 'm', 'k', 'hello', null, { maxTokens: 10 }, false);
  assert.equal(request.url, 'https://x/v1/messages'); assert.equal(request.body.max_tokens, 10); assert.equal(request.headers['x-api-key'], 'k');
});

test('API retry policy retries rate limits and honors the next result', async () => {
  let calls = 0;
  const value = await withRateLimitRetry(async () => { calls += 1; if (calls === 1) throw new ApiRequestError('rate limited', { status: 429, retryAfterMs: 0 }); return 'ok'; }, { retries: 2, baseDelayMs: 1, maxDelayMs: 1 });
  assert.equal(value, 'ok'); assert.equal(calls, 2);
});

test('SSE parser extracts OpenAI text and reasoning deltas', async () => {
  const body = 'data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\n\ndata: {"choices":[{"delta":{"content":"正文"}}]}\n\ndata: [DONE]\n\n';
  const parsed = await readSseResponse(new Response(body), 'openai');
  assert.equal(parsed.text, '正文'); assert.equal(parsed.reasoning, '思考');
});

test('API router downgrades unsupported JSON Schema without losing the request', async () => {
  const previousFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls += 1; if (calls === 1) return new Response(JSON.stringify({ error: { message: 'response_format json_schema unsupported' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }); return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}', reasoning_content: 'fallback reasoning' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try {
    const settings = { load: () => ({ useTavernApi: false, actor: { provider: 'openai', endpoint: 'https://example.test/v1', model: 'm', maxTokens: 10, stream: false, maxRetries: 0 } }), getApiKey: () => 'k' };
    const router = new ApiRouter({ settingsStore: settings }); const result = await router.generate({ role: 'actor', prompt: 'x', jsonSchema: { name: 'x', value: { type: 'object' } } });
    assert.equal(result.text, '{"ok":true}'); assert.equal(router.getLastReasoning('actor'), 'fallback reasoning'); assert.equal(calls, 2);
  } finally { globalThis.fetch = previousFetch; }
});

test('project assets survive a fresh store instance through localforage', async () => {
  const map = new Map(); const localforage = { getItem: async (key) => map.get(key) || null, setItem: async (key, value) => map.set(key, structuredClone(value)), removeItem: async (key) => map.delete(key) };
  const project = createProject('正文'); project.chapters = []; await new ProjectStore({ localforage }).save(project);
  const restored = await new ProjectStore({ localforage }).load(); assert.equal(restored.projectId, project.projectId); assert.equal(restored.sourceText, '正文');
});

test('API keys persist with the NovelAI extension settings like StoryWeaver', () => {
  const context = { extensionSettings: {}, saveSettingsDebounced: () => {} };
  const first = new SettingsStore(() => context); const settings = first.load();
  first.setApiKey('actor', 'actor-key'); first.setApiKey('director', 'director-key'); first.save(settings);
  const reloaded = new SettingsStore(() => context); reloaded.load();
  assert.equal(reloaded.getApiKey('actor'), 'actor-key'); assert.equal(reloaded.getApiKey('director'), 'director-key');
});

test('chapter jobs keep per-chapter status and merge outputs', async () => {
  const project = createProject('');
  project.exports.lastWorldbookAt = Date.now();
  project.chapters = [{ chapterId: 1, chapterName: '第一章', text: '开头。结尾。', confirmed: true, sourceVersion: 1 }, { chapterId: 2, chapterName: '第二章', text: '新的开头。新的结尾。', confirmed: true, sourceVersion: 1 }];
  let calls = 0;
  const router = { generate: async ({ prompt }) => { calls += 1; if (prompt.includes('节拍')) { const second = prompt.includes('第二章'); return { text: second ? '{"summary":"摘要","beats":[{"summary":"a","exitCondition":"x","text":"新的开头。"},{"summary":"b","exitCondition":"y","text":"新的结尾。"}]}' : '{"summary":"摘要","beats":[{"summary":"a","exitCondition":"x","text":"开头。"},{"summary":"b","exitCondition":"y","text":"结尾。"}]}' }; } return { text: '{"角色":{"甲":{"关键词":["甲"],"内容":"**性格**: 稳重"}}}' }; } };
  const wb = await runWorldbookJob(project, { apiRouter: router, concurrency: 2, onProgress: () => {} }); assert.equal(wb.entries.length, 1); assert.equal(wb.results.length, 2);
  const beats = await runBeatJob(project, { apiRouter: router, concurrency: 2 }); assert.equal(beats.assets.length, 2); assert.equal(calls, 4);
});

test('editing a beat preserves chapter boundary validation', () => {
  const chapter = { chapterId: 1, chapterName: '第一章', text: '开头。中间。结尾。' };
  const asset = normalizeBeats(chapter, { summary: '摘要', beats: [{ summary: 'a', exitCondition: 'x', text: '开头。' }, { summary: 'b', exitCondition: 'y', text: '中间。结尾。' }] }).asset;
  const edited = updateBeatAsset(chapter, asset, 'b1', { summary: '新摘要', text: '开头。' }); assert.equal(edited.beats[0].summary, '新摘要');
  assert.throws(() => updateBeatAsset(chapter, asset, 'b1', { text: '错误起点。' }), /边界校验/);
});

test('beat merge and reorder retain valid edges', () => {
  const chapter = { chapterId: 1, chapterName: '第一章', text: '开头。中间。结尾。' };
  const asset = normalizeBeats(chapter, { summary: '摘要', beats: [{ summary: 'a', exitCondition: 'x', text: '开头。' }, { summary: 'b', exitCondition: 'y', text: '中间。' }, { summary: 'c', exitCondition: 'z', text: '结尾。' }] }).asset;
  const merged = mergeAdjacentBeatAsset(chapter, asset, 'b2', 'next'); assert.equal(merged.beats.length, 2); assert.match(merged.beats[1].text, /中间。/);
  assert.throws(() => moveBeatAsset(chapter, asset, 'b1', 1), /边界校验/);
});

test('runtime interceptor injects one marked execution and commits actor reply', async () => {
  const project = createProject('');
  project.exports.lastWorldbookAt = Date.now();
  project.worldbookEntries = [{ id: 'e', category: '角色', name: '甲', normalizedName: '甲', keywords: ['甲'], content: '内容', constant: false, position: 'before_char', depth: 4, order: 1, sourceChapterIds: [] }];
  project.runtime.currentStage = { chapterId: 1, beatId: 'b1' }; project.runtime.isNewbeat = true;
  project.beatAssets = [{ chapterId: 1, chapterName: '第一章', summary: '摘要', opening: '开头。', ending: '结尾。', beats: [{ beatId: 'b1', order: 0, summary: '事件', exitCondition: '完成', text: '开头。结尾。', opening: '开头。', ending: '结尾。' }, { beatId: 'b2', order: 1, summary: '后续', exitCondition: '结束', text: '后续。结束。', opening: '后续。', ending: '结束。' }] }];
  const chat = [{ is_user: true, mes: '我观察四周。' }];
  const controller = new RuntimeController({ getProject: () => project, updateProject: async (mutate) => Object.assign(project, mutate(project)), settingsStore: { load: () => ({ enabled: true, directorPrompt: '', actorPrompt: '' }) }, apiRouter: { generate: async () => ({ text: '{"conflict_level":"normal","direction_script":{"action_chain":"a→b→c"}}' }) }, adapter: { getContext: () => ({ characterId: 0 }), getChat: () => chat, saveMetadata: async () => {} } });
  await controller.intercept(chat, 4096, () => {}, 'normal'); assert.equal(chat.filter((item) => String(item.mes).includes('NOVELAI_EXECUTION')).length, 1); chat.push({ is_user: false, mes: '演员回复。' }); await controller.onMessageReceived(chat.length - 1, 'normal'); assert.equal(project.runtime.isNewbeat, false);
});

test('chapter invalidation removes only affected assets and single-source entries', () => {
  const project = createProject(''); project.processing = { worldbook: {}, beats: {} }; project.runtime.currentStage = { chapterId: 1, beatId: 'b1' };
  project.beatAssets = [{ chapterId: 1, beats: [] }, { chapterId: 2, beats: [] }];
  project.worldbookEntries = [{ id: 'one', sourceChapterIds: [1] }, { id: 'both', sourceChapterIds: [1, 2] }];
  invalidateChapterAssets(project, [1]); assert.deepEqual(project.beatAssets.map((item) => item.chapterId), [2]); assert.deepEqual(project.worldbookEntries.map((item) => item.id), ['both']); assert.deepEqual(project.worldbookEntries[0].sourceChapterIds, [2]); assert.equal(project.runtime.currentStage, null);
});

test('director prompt resolves every runtime placeholder', () => {
  const prompt = buildDirectorPrompt({ chapterId: 1, beatId: 'b1', chapterName: '第一章', summary: '摘要', eventSummary: '事件', exitCondition: '结束', beatText: '原文', stageIdx: [1, 'b1'] });
  assert.equal(/\{(?:CHAPTER_TITLE|FIXED_STAGE_IDX|START_ANCHOR)\}/.test(prompt), false); assert.match(prompt, /\[1,"b1"\]/);
});

test('job cancellation marks queued chapters without losing completed work', async () => {
  const project = createProject(''); project.chapters = [{ chapterId: 1, chapterName: '第一章', text: '一。', confirmed: true }, { chapterId: 2, chapterName: '第二章', text: '二。', confirmed: true }];
  const controller = new AbortController(); let calls = 0;
  const result = await runWorldbookJob(project, { concurrency: 1, signal: controller.signal, apiRouter: { generate: async () => { calls += 1; controller.abort(); return { text: '{"角色":{}}' }; } } });
  assert.equal(calls, 1); assert.equal(result.results.some((item) => item.status === 'cancelled'), true);
});

test('project migration restores optional collections without pretending completion', () => {
  const migrated = migrateProject({ projectId: 'old', sourceText: '正文', schemaVersion: 1, version: 2, chapters: [] });
  assert.deepEqual(migrated.worldbookEntries, []); assert.deepEqual(migrated.beatAssets, []); assert.equal(migrated.processing.overall, 'pending'); assert.equal(migrated.runtime.currentStage, null);
});
