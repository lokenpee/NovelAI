import { EXTENSION_KEY } from '../../domain/constants.js';

export class SillyTavernAdapter {
  getContext() { return globalThis.SillyTavern?.getContext?.() || {}; }
  getRequestHeaders() { return this.getContext().getRequestHeaders?.() || { 'Content-Type': 'application/json' }; }
  on(eventName, handler) {
    const context = this.getContext();
    if (!context.eventSource?.on) return () => {};
    context.eventSource.on(context.event_types?.[eventName] || eventName, handler);
    return () => context.eventSource.removeListener?.(context.event_types?.[eventName] || eventName, handler);
  }
  async renderTemplate(folder, template) {
    const context = this.getContext();
    if (context.renderExtensionTemplateAsync) {
      try { return await context.renderExtensionTemplateAsync(folder, template, {}); } catch { /* fallback below */ }
    }
    return null;
  }
  async saveMetadata() { await this.getContext().saveMetadata?.(); }
  getChatMetadata() { return this.getContext().chatMetadata || {}; }
  getChat() { return this.getContext().chat || []; }
  getCharacter() {
    const context = this.getContext();
    return context.characterId === undefined ? null : context.characters?.[context.characterId] || null;
  }
  async writeCharacterExtension(value) {
    const context = this.getContext();
    if (context.characterId === undefined || !context.writeExtensionField) return false;
    await context.writeExtensionField(context.characterId, `${EXTENSION_KEY}_project`, value);
    return true;
  }
  hasCharacterOrGroup() { const context = this.getContext(); return context.characterId !== undefined || !!context.groupId; }
  notify(type, message) { globalThis.toastr?.[type]?.(message); }
  async confirm(title, message) {
    const popup = this.getContext().Popup;
    if (popup?.show?.confirm) {
      const result = await popup.show.confirm(title, message);
      return result === this.getContext().POPUP_RESULT?.AFFIRMATIVE || result === true;
    }
    return globalThis.confirm?.(`${title}\n${message}`) ?? false;
  }
  downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
