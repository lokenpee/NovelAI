import { escapeHtml, tokenEstimate } from '../utils/html.js';

function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function showManualMergeDialog({ entries = [], categories = [], selectedIds = [], documentRef = globalThis.document } = {}) {
  if (!documentRef?.createElement) return Promise.reject(new Error('当前环境无法打开合并窗口'));
  if (entries.length < 2) return Promise.reject(new Error('至少需要两个世界书条目才能合并'));

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const selected = new Set(selectedIds.filter((id) => byId.has(id)));
  const overlay = documentRef.createElement('div');
  overlay.className = 'nai-modal-overlay';
  overlay.innerHTML = '<div class="nai-modal" role="dialog" aria-modal="true"><header><h3>✋ 手动合并条目</h3><button class="nai-icon-btn" data-merge-action="cancel" aria-label="关闭">×</button></header><div class="nai-modal-body"></div><footer></footer></div>';
  const body = overlay.querySelector('.nai-modal-body');
  const footer = overlay.querySelector('footer');

  return new Promise((resolve) => {
    const close = (value = null) => { overlay.remove(); resolve(value); };

    function updateSelectionStatus() {
      const summary = overlay.querySelector('[data-merge-selection-summary]');
      const next = overlay.querySelector('[data-merge-action="next"]');
      const chosen = [...selected].map((id) => byId.get(id)).filter(Boolean);
      if (summary) summary.innerHTML = chosen.length
        ? `<strong>已选择 ${chosen.length} 个条目</strong><div>${chosen.map((entry) => `<span>[${escapeHtml(entry.category)}] ${escapeHtml(entry.name)}</span>`).join('')}</div>`
        : '<span>尚未选择条目</span>';
      if (next) { next.disabled = chosen.length < 2; next.textContent = chosen.length < 2 ? '下一步：配置合并（至少选 2 个）' : `下一步：配置合并（${chosen.length} 个）`; }
    }

    function renderSelectionStep() {
      const groups = categories.map((category) => ({ category, entries: entries.filter((entry) => entry.category === category.name) })).filter((group) => group.entries.length);
      body.innerHTML = `<div class="nai-modal-hint">勾选两个或更多条目。支持跨分类选择，下一步可以指定合并后的名称和目标分类。</div><div class="nai-merge-selection-list">${groups.map((group) => `<details><summary>📁 ${escapeHtml(group.category.name)} <span>${group.entries.length} 条</span></summary><div>${group.entries.map((entry) => `<label><input type="checkbox" data-merge-entry="${escapeHtml(entry.id)}" ${selected.has(entry.id) ? 'checked' : ''}><span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml((entry.keywords || []).slice(0, 4).join('、'))} · ${tokenEstimate(entry.content)} tk</small></span></label>`).join('')}</div></details>`).join('')}</div><div class="nai-merge-selection-summary" data-merge-selection-summary></div>`;
      footer.innerHTML = '<button class="nai-btn" data-merge-action="clear">清除选择</button><button class="nai-btn nai-btn-primary" data-merge-action="next">下一步：配置合并</button>';
      updateSelectionStatus();
    }

    function renderConfigStep() {
      const chosen = [...selected].map((id) => byId.get(id)).filter(Boolean);
      const commonCategory = chosen.every((entry) => entry.category === chosen[0].category) ? chosen[0].category : chosen[0].category;
      const keywords = unique(chosen.flatMap((entry) => [...(entry.keywords || []), entry.name]));
      const mergedContent = chosen.map((entry) => entry.content).filter(Boolean).join('\n\n');
      body.innerHTML = `<div class="nai-merge-config-grid"><section><h4>📌 合并后名称</h4><div class="nai-merge-name-options">${chosen.map((entry, index) => `<label><input type="radio" name="nai-merge-name" value="${escapeHtml(entry.name)}" ${index === 0 ? 'checked' : ''}><span>${escapeHtml(entry.name)}</span><small>[${escapeHtml(entry.category)}]</small></label>`).join('')}</div><label class="nai-merge-field"><span>自定义名称（留空使用上方选择）</span><input class="nai-input" data-merge-custom-name></label><label class="nai-merge-field"><span>📂 目标分类</span><select data-merge-category>${categories.map((category) => `<option value="${escapeHtml(category.name)}" ${category.name === commonCategory ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></label></section><section><h4>📋 待合并条目</h4><div class="nai-merge-entry-preview">${chosen.map((entry) => `<details><summary>[${escapeHtml(entry.category)}] ${escapeHtml(entry.name)} · ${tokenEstimate(entry.content)} tk</summary><div><b>关键词：</b>${escapeHtml((entry.keywords || []).join('、'))}<pre>${escapeHtml(entry.content)}</pre></div></details>`).join('')}</div></section></div><section class="nai-merge-result-preview"><h4>🔮 合并预览</h4><p><b>关键词（${keywords.length}）：</b>${escapeHtml(keywords.join('、'))}</p><p><b>预计内容：</b>约 ${tokenEstimate(mergedContent)} tk；程序化汇总全部内容并按行去重，不调用 LLM。</p></section>`;
      footer.innerHTML = '<button class="nai-btn" data-merge-action="back">← 返回选择</button><button class="nai-btn nai-btn-primary" data-merge-action="confirm">✅ 确认合并</button>';
    }

    overlay.addEventListener('change', (event) => {
      const id = event.target.dataset.mergeEntry;
      if (!id) return;
      if (event.target.checked) selected.add(id); else selected.delete(id);
      updateSelectionStatus();
    });
    overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-merge-action]')?.dataset.mergeAction;
      if (!action) return;
      if (action === 'cancel') close();
      else if (action === 'clear') { selected.clear(); renderSelectionStep(); }
      else if (action === 'next' && selected.size >= 2) renderConfigStep();
      else if (action === 'back') renderSelectionStep();
      else if (action === 'confirm') {
        const chosen = [...selected].map((id) => byId.get(id)).filter(Boolean);
        const selectedName = overlay.querySelector('input[name="nai-merge-name"]:checked')?.value || chosen[0]?.name || '';
        const customName = overlay.querySelector('[data-merge-custom-name]')?.value.trim() || '';
        const category = overlay.querySelector('[data-merge-category]')?.value || chosen[0]?.category || '';
        close({ ids: [...selected], name: customName || selectedName, category });
      }
    });
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    documentRef.body.appendChild(overlay);
    renderSelectionStep();
  });
}
