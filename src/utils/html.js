export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function tokenEstimate(value) { return Math.ceil(String(value ?? '').length / 4); }

export function formatCount(value) { return Number(value || 0).toLocaleString('zh-CN'); }
