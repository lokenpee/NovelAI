export function renderSection({ key, title, icon, body, actions = '', collapsedSections }) {
  const isCollapsed = collapsedSections?.has(key);
  return `<section class="nai-section${isCollapsed ? ' is-collapsed' : ''}" data-section-key="${key}"><div class="nai-section-header"><button type="button" class="nai-section-toggle" data-action="toggle-section" data-id="${key}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? '展开区块' : '收起区块'}">${isCollapsed ? '▸' : '▾'}</button><h3><span>${icon}</span>${title}</h3>${actions ? `<div class="nai-section-actions">${actions}</div>` : ''}</div><div class="nai-section-content">${body}</div></section>`;
}
