import { escapeHtml, formatBytes, formatCount } from '../../utils/html.js';

export function renderFileUpload(project = {}) {
  const hasSource = Boolean(String(project.sourceText || ''));
  const fileName = project.sourceFile?.name || '工程包中的正文';
  const chapterCount = (project.chapters || []).length;
  const fileDetails = [
    project.sourceFile?.size != null ? formatBytes(project.sourceFile.size) : '',
    project.sourceFile?.encoding || '',
    `${formatCount(project.sourceText?.length)} 字`,
    chapterCount ? `已捕获 ${formatCount(chapterCount)} 章` : '等待检测章节',
  ].filter(Boolean).join(' · ');
  const picker = '<input id="nai-txt-file" type="file" accept=".txt,.json,application/json,text/plain">';

  if (!hasSource) {
    return `<div class="nai-upload-zone" data-action="choose-file"><div class="nai-upload-icon">📄</div><strong>点击或拖拽 TXT 文件到这里</strong><span>支持 .txt；也可导入本插件工程包 JSON</span>${picker}</div><div class="nai-file-status"><span>尚未载入文件</span></div>`;
  }

  return `<div class="nai-loaded-file"><div class="nai-loaded-file-icon">📄</div><div class="nai-loaded-file-info"><strong title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</strong><span>${escapeHtml(fileDetails)}</span></div><div class="nai-loaded-file-actions"><button class="nai-btn nai-btn-small" data-action="choose-file">重新选择</button></div>${picker}</div>`;
}
