import { ApiRequestError, getRetryAfterMs, isAbortError, withRateLimitRetry } from './retryPolicy.js';
import { extractApiText, extractReasoning, readSseResponse } from './responseParsers.js';

function normalizeProvider(value) {
  const provider = String(value || 'openai').trim().toLowerCase();
  return provider === 'openai-compatible' ? 'openai' : provider;
}

function normalizeEndpoint(endpoint, provider) {
  if (endpoint) return String(endpoint).replace(/\/$/, '');
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1';
  return 'https://api.openai.com/v1';
}

function clamp(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

export class ApiRouter {
  constructor({ contextProvider = () => ({}), settingsStore, logger } = {}) { this.contextProvider = contextProvider; this.settingsStore = settingsStore; this.logger = logger; this.lastReasoning = { actor: '', director: '' }; }

  async generate({ role = 'actor', prompt, jsonSchema, signal, timeoutMs } = {}) {
    const settings = this.settingsStore?.load?.() || {};
    const config = settings[role] || {};
    const policy = this.getPolicy(config, timeoutMs);
    const result = settings.useTavernApi
      ? await this.generateWithTavern({ prompt, jsonSchema, signal, policy })
      : await this.generateCustom({ config, apiKey: this.settingsStore?.getApiKey(role) || '', prompt, jsonSchema, signal, policy, role });
    this.lastReasoning[role] = String(result.reasoning || '').trim();
    return result;
  }

  getPolicy(config, timeoutMs) {
    return {
      timeoutMs: clamp(timeoutMs ?? config.timeoutMs, 180000, 3000, 600000),
      retries: clamp(config.maxRetries, 3, 0, 6),
      maxTokens: clamp(config.maxTokens, 32768, 1, 200000),
      stream: config.stream !== false,
    };
  }

  async generateWithTavern({ prompt, jsonSchema, signal, policy }) {
    const context = this.contextProvider(); const generator = context.generateRaw || context.generateQuietPrompt;
    if (!generator) throw new Error('当前 SillyTavern 未提供 generateRaw/generateQuietPrompt');
    return withRateLimitRetry(async () => {
      const result = await withTimeout(generator.call(context, context.generateRaw ? { prompt, jsonSchema } : { quietPrompt: prompt, jsonSchema }), policy.timeoutMs, signal);
      const text = typeof result === 'string' ? result : result?.text || result?.output || '';
      if (!String(text).trim()) throw new ApiRequestError('酒馆 API 返回空文本');
      return { text, raw: result, reasoning: '', usage: result?.usage || null, requestId: result?.requestId || `tavern_${Date.now()}` };
    }, { retries: policy.retries, signal, onRetry: (error, attempt, delay) => this.logRetry('酒馆 API', error, attempt, delay) });
  }

  async generateCustom({ config, apiKey, prompt, jsonSchema, signal, policy, role }) {
    const provider = normalizeProvider(config.provider);
    if (!config.model) throw new Error('请先填写模型名称');
    if ((provider === 'gemini' || provider === 'anthropic') && !apiKey) throw new Error(`${provider === 'gemini' ? 'Gemini' : 'Anthropic'} API Key 未设置`);
    const base = { provider, endpoint: normalizeEndpoint(config.endpoint, provider), model: String(config.model), apiKey, prompt: String(prompt || ''), jsonSchema, signal, policy, role };
    try { return await this.executeCustom(base); }
    catch (error) {
      if (jsonSchema && isJsonSchemaUnsupported(error)) {
        this.logger?.warn('JSON Schema 不受端点支持，已回退普通 JSON 提示词', { provider, role, status: error.status });
        return this.executeCustom({ ...base, jsonSchema: null });
      }
      throw error;
    }
  }

  async executeCustom(base) {
    try { return await this.executeCustomWithStream(base, base.policy.stream); }
    catch (error) {
      if (base.policy.stream && canFallbackFromStream(error)) {
        this.logger?.warn('流式请求不可用，已回退非流式请求', { provider: base.provider, role: base.role, status: error.status, error: error.message });
        return this.executeCustomWithStream(base, false);
      }
      throw error;
    }
  }

  async executeCustomWithStream(base, stream) {
    return withRateLimitRetry(async () => this.sendCustomRequest(base, stream), {
      retries: base.policy.retries,
      signal: base.signal,
      onRetry: (error, attempt, delay) => this.logRetry(`${base.provider} API`, error, attempt, delay),
    });
  }

  async sendCustomRequest(base, stream) {
    const request = this.buildRequest(base.provider, base.endpoint, base.model, base.apiKey, base.prompt, base.jsonSchema, base.policy, stream);
    const response = await fetchWithTimeout(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) }, base.policy.timeoutMs, base.signal);
    if (!response.ok) throw await buildHttpError(response);
    if (request.stream) {
      const streamed = await readSseResponse(response, base.provider);
      if (!streamed.text) throw new ApiRequestError('流式响应为空', { status: 0, raw: streamed.raw });
      return { text: streamed.text, raw: streamed.raw, reasoning: streamed.reasoning, usage: null, requestId: response.headers.get('x-request-id') || `stream_${Date.now()}` };
    }
    const raw = await response.json().catch(() => ({}));
    const text = extractApiText(base.provider, raw);
    if (!String(text).trim()) throw new ApiRequestError('API 返回可解析但正文为空', { status: 0, raw });
    return { text, raw, reasoning: extractReasoning(base.provider, raw), usage: raw.usage || raw.usageMetadata || null, requestId: response.headers.get('x-request-id') || `custom_${Date.now()}` };
  }

  buildRequest(provider, endpoint, model, apiKey, prompt, jsonSchema, policy = {}, stream = false) {
    const maxTokens = clamp(policy.maxTokens, 32768, 1, 200000);
    const useStream = stream && provider !== 'gemini';
    if (provider === 'gemini') {
      return { stream: false, url: `${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, headers: { 'Content-Type': 'application/json' }, body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } } };
    }
    if (provider === 'anthropic') {
      return { stream: useStream, url: `${endpoint}/messages`, headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', ...(useStream ? { Accept: 'text/event-stream' } : {}) }, body: { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], ...(useStream ? { stream: true } : {}) } };
    }
    const responseFormat = jsonSchema ? { type: 'json_schema', json_schema: { name: jsonSchema.name || 'NovelAIResponse', strict: jsonSchema.strict !== false, schema: jsonSchema.value || jsonSchema.schema || jsonSchema } } : undefined;
    return { stream: useStream, url: `${endpoint}/chat/completions`, headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(useStream ? { Accept: 'text/event-stream' } : {}) }, body: { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], ...(responseFormat ? { response_format: responseFormat } : {}), ...(useStream ? { stream: true } : {}) } };
  }

  async listModels(role = 'actor') {
    const settings = this.settingsStore.load(); if (settings.useTavernApi) return [];
    const config = settings[role] || {}; const provider = normalizeProvider(config.provider); const apiKey = this.settingsStore.getApiKey(role); const endpoint = normalizeEndpoint(config.endpoint, provider);
    if (provider !== 'openai') throw new Error('当前协议不保证模型列表接口，请手工填写模型名');
    const response = await fetchWithTimeout(toModelsUrl(endpoint), { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }, this.getPolicy(config).timeoutMs);
    if (!response.ok) throw await buildHttpError(response);
    const data = await response.json(); return (data.data || data.models || []).map((item) => item.id || item.name || item).filter(Boolean);
  }

  getLastReasoning(role = 'actor') { return this.lastReasoning[role] || ''; }

  logRetry(label, error, attempt, delay) { this.logger?.warn(`${label} 限流或暂时失败，准备重试`, { status: error?.status, attempt, delayMs: delay, error: error?.message }); }
}

function toModelsUrl(endpoint) {
  if (/\/chat\/completions$/i.test(endpoint)) return endpoint.replace(/\/chat\/completions$/i, '/models');
  if (/\/v1$/i.test(endpoint)) return `${endpoint}/models`;
  return `${endpoint.replace(/\/$/, '')}/models`;
}

function isJsonSchemaUnsupported(error) {
  if (![400, 404, 422].includes(Number(error?.status))) return false;
  return /response_format|json_schema|json schema|structured output|unsupported.*json|unknown field/i.test(String(error?.message || ''));
}

function canFallbackFromStream(error) {
  return !isAbortError(error) && (Number(error?.status || 0) === 0 || [400, 404, 406, 415, 422, 501].includes(Number(error?.status)) || /stream|event-stream|reader|empty/i.test(String(error?.message || '')));
}

async function fetchWithTimeout(url, options, timeoutMs, signal) {
  const controller = new AbortController(); const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error?.name === 'AbortError') throw new ApiRequestError(`API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`, { status: 0 });
    throw new ApiRequestError(error?.message || '网络请求失败', { status: 0 });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

async function withTimeout(promise, timeoutMs, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let timer; let onAbort;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiRequestError(`API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`)), timeoutMs); });
  const aborted = new Promise((_, reject) => { onAbort = () => reject(new DOMException('Aborted', 'AbortError')); signal?.addEventListener('abort', onAbort, { once: true }); });
  try { return await Promise.race([promise, timeout, aborted]); } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

async function buildHttpError(response) {
  const raw = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  const message = raw?.error?.message || raw?.message || raw?.error || `API 请求失败 (${response.status})`;
  return new ApiRequestError(String(message), { status: response.status, retryAfterMs: getRetryAfterMs(response.headers), raw });
}
