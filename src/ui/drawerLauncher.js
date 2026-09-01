const DEFAULT_DRAWER_HTML = '<div id="novelai-wrapper" class="drawer"><div class="drawer-toggle" title="NovelAI" role="button" tabindex="0"><div id="novelai-icon" class="drawer-icon fa-solid fa-clapperboard fa-fw interactable closedIcon" aria-label="NovelAI"></div></div></div>';

export function getExtensionFolderName(moduleUrl = import.meta.url) {
  const match = /\/scripts\/extensions\/third-party\/([^/]+)\//.exec(moduleUrl);
  return match?.[1] ? decodeURIComponent(match[1]) : 'NovelAI';
}

export function mountDrawerAtTopbar(documentRef, html) {
  const anchor = documentRef?.querySelector?.('#extensions-settings-button');
  if (!anchor) return null;

  const existingWrapper = documentRef.querySelector('#novelai-wrapper');
  if (existingWrapper) {
    anchor.insertAdjacentElement('afterend', existingWrapper);
  } else {
    anchor.insertAdjacentHTML('afterend', html);
  }

  return documentRef.querySelector('#novelai-wrapper');
}

export async function ensureDrawerLauncher({
  adapter,
  documentRef = globalThis.document,
  maxAttempts = 30,
  intervalMs = 100,
} = {}) {
  if (!documentRef?.querySelector) return null;

  const folder = getExtensionFolderName();
  let html = '';
  try {
    html = await adapter?.renderTemplate?.(`third-party/${folder}`, 'drawer-component');
  } catch {
    html = '';
  }
  if (!html || !String(html).trim()) html = DEFAULT_DRAWER_HTML;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const drawer = mountDrawerAtTopbar(documentRef, html);
    if (drawer) return drawer;
    if (attempt + 1 < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const fallbackTarget = documentRef.querySelector('#extensions_settings2')
    || documentRef.querySelector('#extensions_settings')
    || documentRef.body;
  const existingWrapper = documentRef.querySelector('#novelai-wrapper');
  if (existingWrapper && fallbackTarget?.appendChild) {
    fallbackTarget.appendChild(existingWrapper);
  } else {
    fallbackTarget?.insertAdjacentHTML?.('beforeend', html);
  }
  return documentRef.querySelector('#novelai-wrapper');
}
