import { escapeHtml, formatCount } from '../../utils/html.js';

function renderChapterCard(chapter, index, openChapterId) {
  const isOpen = chapter.chapterId === openChapterId;
  const status = chapter.confirmed ? '✅ 已确认' : '⚠️ 待确认';
  const charCount = Number.isFinite(chapter.charCount) ? chapter.charCount : String(chapter.text || '').length;
  const sourceEditor = isOpen
    ? `<div class="nai-chapter-source" data-chapter-source="${chapter.chapterId}"><div class="nai-chapter-source-header"><strong>📝 原文内容</strong><span>${formatCount(charCount)} 字</span><button class="nai-btn nai-btn-small" data-action="copy-chapter" data-id="${chapter.chapterId}">📋 复制</button></div><label class="nai-chapter-field"><span>章节名称</span><input class="nai-input" data-chapter-name="${chapter.chapterId}" value="${escapeHtml(chapter.chapterName)}"></label><label class="nai-chapter-field"><span>章节原文</span><textarea data-chapter-editor="${chapter.chapterId}" rows="14">${escapeHtml(chapter.text)}</textarea></label><div class="nai-chapter-source-actions"><button class="nai-btn nai-btn-primary" data-action="save-chapter" data-id="${chapter.chapterId}">💾 保存修改</button><span>修改后，本章相关世界书与节拍会标记为需要重新生成。</span></div></div>`
    : '';

  const preview = String(chapter.text || '').replace(/\s+/g, ' ').trim().slice(0, 36);
  return `<article class="nai-chapter-card ${isOpen ? 'is-open' : ''}"><div class="nai-chapter-row"><div class="nai-chapter-main"><input type="checkbox" data-select-chapter="${chapter.chapterId}" aria-label="选择 ${escapeHtml(chapter.chapterName)}"><button class="nai-chapter-title" data-action="toggle-chapter-source" data-id="${chapter.chapterId}" aria-expanded="${isOpen}" title="点击查看/编辑原文"><strong><em>#${index + 1}</em>${escapeHtml(chapter.chapterName)}<span class="nai-chevron" aria-hidden="true">${isOpen ? '▾' : '▸'}</span></strong><span>${formatCount(charCount)} 字 · ${status}</span><small>${escapeHtml(preview)}${String(chapter.text || '').length > 36 ? '…' : ''}</small></button></div><div class="nai-chapter-actions">${chapter.confirmed ? '' : `<button class="nai-btn nai-btn-small nai-btn-primary" data-action="confirm-chapter" data-id="${chapter.chapterId}">确认</button>`}<button class="nai-btn nai-btn-small" data-action="merge-chapter" data-id="${chapter.chapterId}" data-direction="previous">合并上章</button><button class="nai-btn nai-btn-small" data-action="merge-chapter" data-id="${chapter.chapterId}" data-direction="next">合并下章</button></div></div>${sourceEditor}</article>`;
}

export function renderChapterQueue(chapters = [], { openChapterId = null } = {}) {
  const confirmedCount = chapters.filter((item) => item.confirmed).length;
  const summary = `<div class="nai-queue-summary"><span>共 ${formatCount(chapters.length)} 章</span><span>${formatCount(confirmedCount)} 章已确认</span><span class="nai-queue-hint">点击章节名称可查看和编辑原文</span><button class="nai-btn nai-btn-danger" data-action="delete-selected-chapters" ${chapters.length ? '' : 'disabled'}>🗑️ 删除选中</button></div>`;
  const cards = chapters.length
    ? chapters.map((chapter, index) => renderChapterCard(chapter, index, openChapterId)).join('')
    : '<div class="nai-empty">导入 TXT 并检测章节后，这里会显示章节队列</div>';
  return `${summary}<div class="nai-chapter-queue">${cards}</div>`;
}
