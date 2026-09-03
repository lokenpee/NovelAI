import { escapeHtml, formatCount } from '../utils/html.js';

function statusText(chapter) {
  if (chapter.status === 'running') return '🔄 处理中';
  if (chapter.status === 'failed') return '❌ 处理失败';
  if (chapter.confirmed) return '✅ 已确认';
  return '⏳ 待确认';
}

export function showChapterDialog({ chapter, index = 0, total = 1, documentRef = globalThis.document } = {}) {
  if (!chapter || !documentRef?.createElement) return Promise.reject(new Error('章节不存在或当前环境不支持编辑窗口'));
  const overlay = documentRef.createElement('div');
  overlay.className = 'nai-modal-overlay';
  overlay.innerHTML = '<div class="nai-modal nai-chapter-modal" role="dialog" aria-modal="true"><header><h3></h3><button class="nai-icon-btn" data-chapter-action="cancel" aria-label="关闭">×</button></header><div class="nai-modal-body"></div><footer></footer></div>';
  overlay.querySelector('h3').textContent = `📄 ${chapter.chapterName}（第${index + 1}章）`;
  const body = overlay.querySelector('.nai-modal-body');
  const footer = overlay.querySelector('footer');
  body.innerHTML = `<div class="nai-chapter-dialog-meta"><span class="nai-chapter-dialog-status">${statusText(chapter)}</span><span>字数：<b data-chapter-count>${formatCount(String(chapter.text || '').length)}</b></span><span>队列位置：${index + 1} / ${total}</span></div>${chapter.error ? `<div class="nai-chapter-dialog-error">❌ ${escapeHtml(chapter.error)}</div>` : ''}<div class="nai-chapter-dialog-toolbar"><button class="nai-btn nai-btn-small" data-chapter-action="copy">📋 复制正文</button><button class="nai-btn nai-btn-small nai-btn-danger" data-chapter-action="delete">🗑️ 删除章节</button></div><label class="nai-chapter-field"><span>章节名称</span><input class="nai-input" data-chapter-name value="${escapeHtml(chapter.chapterName)}"></label><label class="nai-chapter-field"><span>原文内容（可编辑）</span><textarea data-chapter-editor rows="18">${escapeHtml(chapter.text)}</textarea></label><div class="nai-chapter-dialog-hint">修改后会清除本章已有的世界书与节拍结果，需要重新生成。</div>`;
  footer.innerHTML = `<div class="nai-chapter-dialog-adjacent"><button class="nai-btn nai-btn-small" data-chapter-action="merge-previous" ${index === 0 ? 'disabled' : ''}>⬆️ 合并到上一章</button><button class="nai-btn nai-btn-small" data-chapter-action="merge-next" ${index === total - 1 ? 'disabled' : ''}>⬇️ 合并到下一章</button></div><button class="nai-btn" data-chapter-action="cancel">取消</button><button class="nai-btn nai-btn-primary" data-chapter-action="save">💾 保存修改</button>`;

  return new Promise((resolve) => {
    const close = (value = null) => { overlay.remove(); resolve(value); };
    const editor = overlay.querySelector('[data-chapter-editor]');
    const count = overlay.querySelector('[data-chapter-count]');
    editor.addEventListener('input', () => { count.textContent = formatCount(editor.value.length); });
    overlay.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-chapter-action]')?.dataset.chapterAction;
      if (!action) return;
      if (action === 'cancel') close();
      else if (action === 'copy') {
        if (!globalThis.navigator?.clipboard?.writeText) return;
        await globalThis.navigator.clipboard.writeText(editor.value);
        const button = event.target.closest('button');
        if (button) { const old = button.textContent; button.textContent = '✅ 已复制'; setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1200); }
      } else if (action === 'delete') close({ type: 'delete' });
      else if (action === 'save') close({ type: 'save', chapterName: overlay.querySelector('[data-chapter-name]').value, text: editor.value });
      else if (action === 'merge-previous') close({ type: 'merge', direction: 'previous', text: editor.value });
      else if (action === 'merge-next') close({ type: 'merge', direction: 'next', text: editor.value });
    });
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    documentRef.body.appendChild(overlay);
    editor.focus();
  });
}
