import { escapeHtml } from '../../utils/html.js';
import { renderWorldbook } from './worldbookView.js';
import { renderFileUpload } from './fileUploadView.js';
import { renderChapterQueue } from './chapterQueueView.js';
import { renderSection } from './section.js';

export function renderWorkspace(project = {}, { openCategoryIds = new Set(), openEntryIds = new Set(), openResultCategoryIds = new Set(), selectedEntryIds = new Set(), multiSelectChapters = false, selectedChapterIds = new Set(), isProcessing = false, collapsedSections } = {}) {
  const chapters = project.chapters || [];
  const fileBody = renderFileUpload(project);
  const cleanBody = `<div class="nai-setting-hint">粘贴要删除的重复片段；多个片段用空行分隔，没有空行时按行处理。先预览统计，再执行删除。</div><textarea id="nai-clean-patterns" rows="4" placeholder="例如：\n本章完\n\n请收藏本站..."></textarea><div class="nai-toolbar"><button class="nai-btn" data-action="preview-clean">🔍 预览命中</button><button class="nai-btn nai-btn-primary" data-action="apply-clean" disabled>🧹 执行删除</button><button class="nai-btn" data-action="clean-impurities">🧽 删除杂质</button></div><div id="nai-clean-result" class="nai-clean-results" hidden></div>`;
  const regexBody = `<div class="nai-setting-hint">按行首识别章节标题，默认规则支持“第一章/第 1 章/卷”等中文章节。</div><input id="nai-chapter-regex" class="nai-input" value="${escapeHtml(project.chapterRegex || '')}" aria-label="章节正则"><div class="nai-toolbar"><button class="nai-btn nai-btn-primary" data-action="capture">🔍 检测章节</button><span class="nai-feedback">${chapters.length ? `已捕获 ${chapters.length} 章，其中 ${chapters.filter((item) => item.confirmed).length} 章已确认` : '尚未检测章节'}</span></div><div id="nai-capture-result" class="nai-feedback"></div>`;
  const queueBody = renderChapterQueue(chapters, { multiSelect: multiSelectChapters, selectedChapterIds });
  const fileActions = `<button class="nai-btn nai-btn-small" data-action="import-project">📥 导入工程包</button><button class="nai-btn nai-btn-small" data-action="export-project" ${project.projectId ? '' : 'disabled'}>📤 导出工程包</button><button class="nai-btn nai-btn-small nai-btn-danger" data-action="reset-project">🧹 清空当前项目</button>`;
  return `<div class="nai-workspace">${renderSection({ key: 'upload', title: '文件上传', icon: '📄', body: fileBody, actions: fileActions, collapsedSections })}${renderSection({ key: 'clean', title: '清洗重复段落', icon: '🧹', body: cleanBody, collapsedSections })}${renderSection({ key: 'regex', title: '章回正则设置', icon: '📖', body: regexBody, collapsedSections })}${renderSection({ key: 'queue', title: '章节队列', icon: '📋', body: queueBody, collapsedSections })}${renderWorldbook(project, { openCategoryIds, openEntryIds, openResultCategoryIds, selectedEntryIds, isProcessing, collapsedSections })}</div>`;
}
