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
import { mountDrawerAtTopbar } from '../src/ui/drawerLauncher.js';
import { normalizeSourceFile } from '../src/domain/project/normalizeSourceFile.js';
import { renderWorkspace } from '../src/ui/views/workspaceView.js';
import { readImportFile } from '../src/services/files/readImportFile.js';
import { formatBytes } from '../src/utils/html.js';
import { updateExtensionFromRepo } from '../src/services/platform/extensionUpdater.js';
import { summarizeCleanPreview } from '../src/domain/text/summarizeCleanPreview.js';
import { renderCleanPreviewSummary } from '../src/ui/views/cleanPreviewView.js';
import { renderWorldbook } from '../src/ui/views/worldbookView.js';
import { renderSettings } from '../src/ui/views/settingsView.js';
import { NovelAiPanel } from '../src/ui/panel.js';

test('drawer launcher is mounted after the SillyTavern extensions button', () => {
  const wrapper = { id: 'novelai-wrapper' };
  let placement = null;
  const anchor = {
    insertAdjacentElement(position, element) { placement = { position, element, receiver: 'anchor' }; },
  };
  const documentRef = {
    querySelector(selector) {
      if (selector === '#extensions-settings-button') return anchor;
      if (selector === '#novelai-wrapper') return wrapper;
      return null;
    },
  };

  assert.equal(mountDrawerAtTopbar(documentRef, '<div></div>'), wrapper);
  assert.deepEqual(placement, { position: 'afterend', element: wrapper, receiver: 'anchor' });
});

test('source file metadata keeps only safe display fields', () => {
  assert.deepEqual(normalizeSourceFile({ name: ' 小说.txt ', size: 123.9, lastModified: 456, encoding: 'gb18030' }), { name: '小说.txt', size: 123, lastModified: 456, encoding: 'GB18030' });
  assert.equal(normalizeSourceFile({ name: '' }), null);
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('TXT import detects UTF-8 and common Chinese legacy encoding', async () => {
  const utf8Bytes = new TextEncoder().encode('第一章\n正文');
  const utf8 = await readImportFile({ name: 'utf8.txt', size: utf8Bytes.byteLength, arrayBuffer: async () => utf8Bytes.buffer });
  assert.equal(utf8.encoding, 'UTF-8');
  assert.equal(utf8.text, '第一章\n正文');

  const gb18030Bytes = Uint8Array.from([0xC4, 0xE3, 0xBA, 0xC3]);
  const legacy = await readImportFile({ name: 'legacy.txt', size: gb18030Bytes.byteLength, arrayBuffer: async () => gb18030Bytes.buffer });
  assert.equal(legacy.encoding, 'GB18030');
  assert.equal(legacy.text, '你好');
  await assert.rejects(() => readImportFile({ name: 'bad.exe', size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer }), /仅支持 TXT/);
});

test('plugin updater sends SillyTavern CSRF headers and uses the current folder', async () => {
  const requests = [];
  const result = await updateExtensionFromRepo({
    currentFolder: 'NovelAI-dev',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-token' }),
    fetchImpl: async (path, options) => {
      requests.push({ path, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ isUpToDate: false, shortCommitHash: 'abc1234' }), { status: 200 });
    },
  });
  assert.equal(result.extensionFolder, 'NovelAI-dev');
  assert.equal(result.shortCommitHash, 'abc1234');
  assert.equal(requests[0].options.headers['X-CSRF-Token'], 'csrf-token');
  assert.deepEqual(requests[0].body, { extensionName: 'NovelAI-dev', global: false });
  assert.equal(requests.some((item) => item.body.extensionName === 'StoryWeaver'), false);
});

test('plugin updater detects a global installation after the local path misses', async () => {
  const scopes = [];
  const result = await updateExtensionFromRepo({
    currentFolder: 'NovelAI',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'token' }),
    fetchImpl: async (_path, options) => {
      const body = JSON.parse(options.body);
      scopes.push(body.global);
      return body.global
        ? new Response(JSON.stringify({ isUpToDate: true }), { status: 200 })
        : new Response('Directory does not exist', { status: 404 });
    },
  });
  assert.deepEqual(scopes, [false, true]);
  assert.equal(result.global, true);
  assert.equal(result.isUpToDate, true);
});

test('workspace replaces the upload prompt with loaded file state', () => {
  const emptyHtml = renderWorkspace(createProject());
  assert.match(emptyHtml, /点击或拖拽 TXT 文件到这里/);

  const project = createProject('第一章\n正文', { name: '测试小说.txt', size: 18 });
  project.chapters = [{ chapterId: 1, chapterName: '第一章', text: '第一章\n正文', charCount: 7, confirmed: true }];
  const loadedHtml = renderWorkspace(project);
  assert.doesNotMatch(loadedHtml, /点击或拖拽 TXT 文件到这里/);
  assert.doesNotMatch(loadedHtml, /nai-source-text/);
  assert.match(loadedHtml, /测试小说\.txt/);
  assert.match(loadedHtml, /查看原文/);

  const openedHtml = renderWorkspace(project, { openChapterId: 1 });
  assert.match(openedHtml, /data-chapter-editor="1"/);
  assert.match(openedHtml, /第一章\n正文/);
  assert.match(openedHtml, /保存修改/);
});

test('clean preview summary restores chapter and segment statistics', () => {
  const source = '第一章\n广告\n正文\n第二章\n广告\n广告';
  const preview = previewClean(source, '广告');
  const summary = summarizeCleanPreview(preview, { sourceText: source, chapters: [
    { chapterId: 1, chapterName: '第一章', text: '第一章\n广告\n正文' },
    { chapterId: 2, chapterName: '第二章', text: '第二章\n广告\n广告' },
  ] });
  assert.equal(summary.totalHits, 3);
  assert.equal(summary.chapterStats.length, 2);
  assert.equal(summary.chapterStats[1].hits, 2);
  const html = renderCleanPreviewSummary(summary);
  assert.match(html, /涉及 2 章/);
  assert.match(html, /片段统计/);
  assert.match(html, /命中上下文/);
});

test('worldbook controls expose prompt editing without the misleading settings gear', () => {
  const project = createProject('正文');
  project.chapters = [{ chapterId: 1, chapterName: '第一章', text: '正文', confirmed: true }];
  const closed = renderWorldbook(project);
  assert.match(closed, /编辑提示词/);
  assert.doesNotMatch(closed, /edit-category/);
  assert.doesNotMatch(closed, /⚙️/);
  const opened = renderWorldbook(project, { openCategoryIds: new Set(['character']) });
  assert.match(opened, /data-category-prompt="character"/);
});

test('panel render preserves workspace scroll position during local interactions', () => {
  let content = { scrollTop: 420 };
  const root = {
    querySelector(selector) { return selector === '.nai-content' ? content : null; },
    set innerHTML(_value) { content = { scrollTop: 0 }; },
  };
  const project = createProject();
  const panel = new NovelAiPanel({
    store: { getProject: () => project, isJobRunning: () => false },
    settingsStore: { load: () => ({ enabled: true, actor: {}, director: {} }), getApiKey: () => '' },
    apiRouter: {}, adapter: {}, logger: {},
  });
  panel.root = root;
  panel.render();
  assert.equal(content.scrollTop, 420);
});

test('settings view exposes visible status targets for every functional button', () => {
  const html = renderSettings({ enabled: true, useTavernApi: false, maxConcurrency: 1, actor: {}, director: {} });
  assert.match(html, /data-action="save-settings"/);
  assert.match(html, /data-action="list-models" data-role="actor"/);
  assert.match(html, /data-action="test-api" data-role="director"/);
  assert.match(html, /data-model-status="actor"/);
  assert.match(html, /data-model-select="director"/);
});

test('quick API test saves the current form before sending the request', async () => {
  const settings = { enabled: true, useTavernApi: false, maxConcurrency: 1, actor: {}, director: {} };
  let saved = null;
  const modelStatus = { textContent: '', className: '' };
  const settingsStatus = { textContent: '', className: '' };
  const values = new Map([
    ['#nai-enabled', { checked: true }],
    ['#nai-use-tavern', { checked: false }],
    ['#nai-concurrency', { value: '2' }],
    ['[data-api="actor"][data-key="model"]', { value: 'new-model' }],
    ['[data-model-status="actor"]', modelStatus],
    ['#nai-settings-status', settingsStatus],
  ]);
  const panel = new NovelAiPanel({
    store: {},
    settingsStore: { load: () => settings, setApiKey: () => {}, save: (value) => { saved = structuredClone(value); } },
    apiRouter: { generate: async () => { assert.equal(saved.actor.model, 'new-model'); return { text: 'OK' }; } },
    adapter: {}, logger: {},
  });
  panel.root = { querySelector: (selector) => values.get(selector) || null };
  const button = { disabled: false, textContent: '⚡ 快速测试' };
  await panel.testApi('actor', button);
  assert.equal(saved.maxConcurrency, 2);
  assert.match(modelStatus.textContent, /测试成功/);
  assert.equal(button.disabled, false);
});

test('model list button saves form values and fills a visible selector', async () => {
  const settings = { enabled: true, useTavernApi: false, maxConcurrency: 1, actor: {}, director: {} };
  let saved = null;
  const options = [];
  const select = { innerHTML: '', appendChild: (option) => options.push(option) };
  const wrap = { hidden: true };
  const status = { textContent: '', className: '' };
  const values = new Map([
    ['#nai-enabled', { checked: true }],
    ['#nai-use-tavern', { checked: false }],
    ['#nai-concurrency', { value: '1' }],
    ['[data-api="actor"][data-key="endpoint"]', { value: 'https://example.test/v1' }],
    ['[data-model-select="actor"]', select],
    ['[data-model-select-wrap="actor"]', wrap],
    ['[data-model-status="actor"]', status],
    ['#nai-settings-status', { textContent: '', className: '' }],
  ]);
  const panel = new NovelAiPanel({
    store: {},
    settingsStore: { load: () => settings, setApiKey: () => {}, save: (value) => { saved = structuredClone(value); } },
    apiRouter: { listModels: async () => { assert.equal(saved.actor.endpoint, 'https://example.test/v1'); return ['model-a', 'model-b']; } },
    adapter: {}, logger: {},
  });
  panel.root = {
    ownerDocument: { createElement: () => ({ value: '', textContent: '' }) },
    querySelector: (selector) => values.get(selector) || null,
  };
  const button = { disabled: false, textContent: '🔄 拉取模型' };
  await panel.listModels('actor', button);
  assert.equal(wrap.hidden, false);
  assert.deepEqual(options.map((option) => option.value), ['model-a', 'model-b']);
  assert.match(status.textContent, /找到 2 个模型/);
});

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

test('corrupted persisted project falls back to a clean blank project', async () => {
  const projectStore = { load: async () => { throw new Error('storage invalid'); }, save: async () => {}, clear: async () => {} };
  const settingsStore = { load: () => ({ enabled: true, maxConcurrency: 1 }), getApiKey: () => '' };
  const { AppStore } = await import('../src/services/state/appStore.js');
  const appStore = new AppStore({ projectStore, settingsStore });
  const project = await appStore.init();
  assert.equal(project.sourceText, '');
  assert.deepEqual(project.chapters, []);
  assert.deepEqual(project.beatAssets, []);
});

test('blank project is treated as not loaded until real source data exists', async () => {
  const saved = createProject('');
  const projectStore = { load: async () => saved, save: async () => saved, clear: async () => {} };
  const settingsStore = { load: () => ({ enabled: true, maxConcurrency: 1 }), getApiKey: () => '' };
  const { AppStore } = await import('../src/services/state/appStore.js');
  const appStore = new AppStore({ projectStore, settingsStore });
  const project = await appStore.init();
  assert.equal(project.sourceText, '');
  assert.equal(project.projectId, saved.projectId);
  assert.equal(project.chapters.length, 0);
  assert.equal(project.beatAssets.length, 0);
});
