import { EXTENSION_KEY, clone } from '../../domain/constants.js';

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, useTavernApi: true, maxConcurrency: 1, mainPrompt: '', directorPrompt: '', actorPrompt: '',
  actor: { provider: 'openai', apiKey: '', endpoint: '', model: '', maxTokens: 65536, timeoutMs: 180000, maxRetries: 3, stream: true },
  director: { provider: 'openai', apiKey: '', endpoint: '', model: '', maxTokens: 32768, timeoutMs: 60000, maxRetries: 3, stream: true }
});

export class SettingsStore {
  constructor(contextProvider = () => ({})) { this.contextProvider = contextProvider; this.apiKeys = { actor: '', director: '' }; }
  load() {
    const context = this.contextProvider();
    const existing = context.extensionSettings?.[EXTENSION_KEY] || {};
    const settings = { ...clone(DEFAULT_SETTINGS), ...existing, actor: { ...DEFAULT_SETTINGS.actor, ...(existing.actor || {}) }, director: { ...DEFAULT_SETTINGS.director, ...(existing.director || {}) } };
    this.apiKeys.actor = String(settings.actor.apiKey || '');
    this.apiKeys.director = String(settings.director.apiKey || '');
    if (context.extensionSettings) context.extensionSettings[EXTENSION_KEY] = settings;
    return settings;
  }
  save(settings) {
    const context = this.contextProvider();
    if (context.extensionSettings) {
      const persistent = clone(settings);
      persistent.actor.apiKey = this.apiKeys.actor;
      persistent.director.apiKey = this.apiKeys.director;
      context.extensionSettings[EXTENSION_KEY] = persistent;
      context.saveSettingsDebounced?.();
    }
  }
  setApiKey(role, key) { if (role === 'actor' || role === 'director') this.apiKeys[role] = String(key || ''); }
  getApiKey(role) { return this.apiKeys[role] || ''; }
}
