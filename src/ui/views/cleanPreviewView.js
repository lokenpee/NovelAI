import { escapeHtml, formatCount } from '../../utils/html.js';

export function renderCleanPreviewSummary(summary) {
  if (!summary?.totalHits) {
    return '<div class="nai-clean-summary is-empty">预览完成：没有命中任何待删除片段。</div>';
  }
  const chapters = summary.chapterStats.slice(0, 12).map((item) => `<li>${escapeHtml(item.chapterName)}：命中 ${formatCount(item.hits)} 次，预计删除 ${formatCount(item.removedChars)} 字</li>`).join('');
  const segments = summary.segmentStats.filter((item) => item.hits > 0).slice(0, 6).map((item) => `<li>片段「${escapeHtml(String(item.segment).slice(0, 40))}${String(item.segment).length > 40 ? '…' : ''}」命中 ${formatCount(item.hits)} 次</li>`).join('');
  const samples = summary.samples.map((item) => `<li><span>位置 ${formatCount(item.index)}</span>${escapeHtml(item.preview)}</li>`).join('');
  return `<div class="nai-clean-summary"><strong>预览命中 ${formatCount(summary.totalHits)} 次${summary.chapterStats.length ? `，涉及 ${formatCount(summary.chapterStats.length)} 章` : ''}，预计删除 ${formatCount(summary.totalRemovedChars)} 字</strong><span>已解析 ${formatCount(summary.patternCount)} 个片段 · 精确字面量匹配（不使用正则）</span></div><div class="nai-clean-stat-grid">${chapters ? `<div><b>章节统计</b><ul>${chapters}</ul></div>` : ''}<div><b>片段统计</b><ul>${segments || '<li>无</li>'}</ul></div></div>${samples ? `<details class="nai-clean-samples"><summary>查看命中上下文（最多 6 条）</summary><ul>${samples}</ul></details>` : ''}`;
}
