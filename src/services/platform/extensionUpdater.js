export const NOVELAI_REPO_URL = 'https://github.com/lokenpee/NovelAI';

export function normalizeRepoUrl(repoUrl) {
  const raw = String(repoUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function getRepoFolderName(repoUrl) {
  try {
    const segments = new URL(repoUrl).pathname.split('/').filter(Boolean);
    return segments.length ? decodeURIComponent(segments.at(-1)).replace(/\.git$/i, '') : '';
  } catch {
    return '';
  }
}

async function requestJson(fetchImpl, getRequestHeaders, path, body) {
  const response = await fetchImpl(path, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify(body),
  });
  let text = '';
  try { text = await response.text(); } catch { text = ''; }
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  return { response, text, data };
}

export function extractExtensionApiError(response, text, data) {
  if (data && typeof data === 'object') {
    for (const value of [data.message, data.error, data.detail, data.msg, data.cause]) {
      const normalized = String(value || '').trim();
      if (normalized) return normalized;
    }
  }
  return String(text || '').trim() || response?.statusText || `HTTP ${response?.status || 'unknown'}`;
}

function canTryAnotherTarget(response, detail) {
  const status = Number(response?.status || 0);
  if (status === 404 || status === 409 || status >= 500) return true;
  const normalized = String(detail || '').toLowerCase();
  return normalized.includes('does not exist')
    || normalized.includes('not found')
    || normalized.includes('not a git repository')
    || normalized.includes('not a repository')
    || normalized.includes('enoent');
}

export async function updateExtensionFromRepo({
  repoUrl = NOVELAI_REPO_URL,
  currentFolder,
  fetchImpl = globalThis.fetch,
  getRequestHeaders = () => ({ 'Content-Type': 'application/json' }),
} = {}) {
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  if (!normalizedRepoUrl) throw new Error('仓库地址无效，请检查后重试');
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持快捷更新');

  const repoFolder = getRepoFolderName(normalizedRepoUrl);
  const folders = [...new Set([currentFolder, repoFolder, 'NovelAI', 'novelai'].filter(Boolean))];
  const failures = [];
  let globalPermissionFailure = null;

  for (const folder of folders) {
    for (const isGlobal of [false, true]) {
      const result = await requestJson(fetchImpl, getRequestHeaders, '/api/extensions/update', {
        extensionName: folder,
        global: isGlobal,
      });
      if (result.response.ok) {
        return { mode: 'update', extensionFolder: folder, global: isGlobal, repoUrl: normalizedRepoUrl, ...(result.data || {}) };
      }

      const detail = extractExtensionApiError(result.response, result.text, result.data);
      failures.push({ folder, global: isGlobal, status: result.response.status, detail });
      if (isGlobal && result.response.status === 403) {
        globalPermissionFailure = detail;
        break;
      }
      if (!canTryAnotherTarget(result.response, detail)) throw new Error(`插件更新失败：${detail}`);
    }
  }

  if (globalPermissionFailure && failures.every((item) => item.status === 404 || item.status === 403)) {
    throw new Error(`插件属于全局安装，当前账号无权更新：${globalPermissionFailure}`);
  }

  const install = await requestJson(fetchImpl, getRequestHeaders, '/api/extensions/install', {
    url: normalizedRepoUrl,
    global: false,
    branch: '',
  });
  if (install.response.ok) return { mode: 'install', global: false, repoUrl: normalizedRepoUrl, ...(install.data || {}) };

  const installDetail = extractExtensionApiError(install.response, install.text, install.data);
  if (install.response.status === 409) {
    const updateFailure = failures.find((item) => item.status !== 404 && item.status !== 403);
    if (updateFailure) throw new Error(`插件目录存在但无法通过 Git 更新：${updateFailure.detail}`);
    throw new Error('检测到同名目录已存在但无法直接更新，请到插件管理页确认安装位置');
  }
  throw new Error(`插件安装失败：${installDetail}`);
}
