import { escapeHtml, tokenEstimate } from '../../utils/html.js';
import { renderSection } from './section.js';

function renderEntry(entry, isExpanded, isSelected) {
  return `<article class="nai-entry-card" data-entry-id="${escapeHtml(entry.id)}"><div class="nai-entry-header"><label class="nai-check-label"><input type="checkbox" data-select-entry="${escapeHtml(entry.id)}" ${isSelected ? 'checked' : ''}><span>📄</span><strong>${escapeHtml(entry.name)}</strong></label><span class="nai-entry-meta">${entry.constant ? '🔵 常驻' : '🟢 触发'} · ${tokenEstimate(entry.content)} tk</span><div class="nai-entry-actions"><button class="nai-icon-btn" title="切换蓝绿灯" data-action="toggle-light" data-id="${escapeHtml(entry.id)}">${entry.constant ? '🟢' : '🔵'}</button><button class="nai-icon-btn nai-danger" title="删除条目" data-action="delete-entry" data-id="${escapeHtml(entry.id)}">🗑️</button></div></div><button class="nai-entry-toggle" data-action="toggle-entry" data-id="${escapeHtml(entry.id)}">关键词：${escapeHtml((entry.keywords || []).join('、'))} <span>${isExpanded ? '▴' : '▾'}</span></button>${isExpanded ? `<div class="nai-entry-content"><div class="nai-content-label">📝 内容 · ${tokenEstimate(entry.content)} tk（离开输入框后自动保存）</div><textarea data-entry-content="${escapeHtml(entry.id)}" rows="7">${escapeHtml(entry.content)}</textarea></div>` : ''}</article>`;
}

export function renderWorldbook(project = {}, { openCategoryIds = new Set(), openEntryIds = new Set(), openResultCategoryIds = new Set(), selectedEntryIds = new Set(), isProcessing = false, collapsedSections } = {}) {
  const categories = project.categoryConfigs || [];
  const entries = project.worldbookEntries || [];
  const enabledCount = categories.filter((category) => category.enabled).length;
  const confirmedCount = (project.chapters || []).filter((chapter) => chapter.confirmed).length;
  const hasEntries = entries.length > 0;
  const canExtract = enabledCount > 0 && confirmedCount > 0 && !isProcessing;
  const statusText = !enabledCount
    ? '请至少启用一个分类'
    : !confirmedCount
      ? '请先检测并确认章节'
      : isProcessing
        ? '正在逐章提取，已完成结果会立即保留'
        : hasEntries
          ? `已生成 ${entries.length} 个条目，可重新提取覆盖`
          : `准备处理 ${confirmedCount} 个已确认章节`;

  const categoryCards = categories.map((category) => {
    const isOpen = openCategoryIds.has(category.id);
    return `<article class="nai-prompt-card ${isOpen ? 'is-open' : ''}"><div class="nai-prompt-header"><label class="nai-check-label"><input type="checkbox" data-category-enabled="${escapeHtml(category.id)}" ${category.enabled ? 'checked' : ''}><span>${category.name === '角色' ? '👤' : category.name === '地点' ? '📍' : '🏷️'}</span><strong>${escapeHtml(category.name)}</strong><em>${category.id === 'character' || category.id === 'location' ? '内置' : '自定义'}</em></label><button class="nai-btn nai-btn-small" data-action="toggle-category" data-id="${escapeHtml(category.id)}">${isOpen ? '收起提示词' : '编辑提示词'}</button></div>${isOpen ? `<div class="nai-prompt-body"><textarea data-category-prompt="${escapeHtml(category.id)}" rows="8">${escapeHtml(category.prompt || '')}</textarea><div class="nai-setting-hint">允许字段：${escapeHtml((category.fields || []).join('、'))}。提示词在离开输入框后自动保存。</div></div>` : ''}</article>`;
  }).join('');

  const promptBody = `<div class="nai-prompt-intro">选择要提取的分类；“编辑提示词”只修改该分类的抽取规则，不混入导出位置等无关设置。</div><div class="nai-category-stack">${categoryCards}</div><button class="nai-btn" data-action="add-category">＋ 自定义分类</button><div class="nai-prompt-footer"><span class="nai-setting-hint">${statusText}</span></div>`;
  const grouped = categories.map((category) => ({ category, entries: entries.filter((entry) => entry.category === category.name) })).filter((group) => group.entries.length);
  const resultActions = `<button class="nai-btn" data-action="merge-selected" ${entries.length >= 2 ? '' : 'disabled'}>✋ 手动合并</button><button class="nai-btn" data-action="export-worldbook">📤 导出世界书</button><button class="nai-btn" data-action="export-card">🎴 导出角色卡</button><button class="nai-btn nai-btn-danger" data-action="delete-selected-entries" ${selectedEntryIds.size ? '' : 'disabled'}>🗑️ 删除选中</button>`;
  const groupsHtml = grouped.map((group) => {
    const isOpen = openResultCategoryIds.has(group.category.id);
    return `<section class="nai-result-group ${isOpen ? 'is-open' : ''}"><button class="nai-result-group-header" data-action="toggle-result-category" data-id="${escapeHtml(group.category.id)}" aria-expanded="${isOpen}"><strong><span>${isOpen ? '▾' : '▸'}</span>${escapeHtml(group.category.name)}</strong><span>${group.entries.length} 条</span></button>${isOpen ? `<div class="nai-result-group-body">${group.entries.map((entry) => renderEntry(entry, openEntryIds.has(entry.id), selectedEntryIds.has(entry.id))).join('')}</div>` : ''}</section>`;
  }).join('');
  const resultBody = `<div class="nai-result-toolbar"><div><strong>已生成 ${entries.length} 个条目</strong><span class="nai-setting-hint">${selectedEntryIds.size ? ` 已选择 ${selectedEntryIds.size} 条` : ' 点击类别展开条目'}</span></div><div class="nai-toolbar">${resultActions}</div></div><div class="nai-result-groups">${groupsHtml || '<div class="nai-empty">尚无生成结果。完成章节捕获后，使用页面右下角的“仅提取世界书”。</div>'}</div>`;
  return `${renderSection({ key: 'worldbook-prompt', title: '提取世界书', icon: '📝', body: promptBody, collapsedSections })}${renderSection({ key: 'worldbook-results', title: '生成结果', icon: '📊', body: resultBody, collapsedSections })}`;
}
