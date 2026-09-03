export function renderWorkspaceActions(project = {}, { isProcessing = false } = {}) {
  const confirmedCount = (project.chapters || []).filter((chapter) => chapter.confirmed).length;
  const enabledCount = (project.categoryConfigs || []).filter((category) => category.enabled).length;
  const canRunWorldbook = confirmedCount > 0 && enabledCount > 0 && !isProcessing;
  const canRunBeats = confirmedCount > 0 && !isProcessing;
  const hasWorldbook = (project.worldbookEntries || []).length > 0;
  const hasBeats = (project.beatAssets || []).length > 0;
  return `<footer class="nai-workspace-actions"><span>${confirmedCount ? `${confirmedCount} 个已确认章节` : '请先检测并确认章节'}</span><div><button class="nai-btn nai-btn-primary" data-action="extract-worldbook" ${canRunWorldbook ? '' : 'disabled'}>${isProcessing ? '⏳ 任务进行中' : hasWorldbook ? '📚 重新提取世界书' : '📚 仅提取世界书'}</button><button class="nai-btn" data-action="parse-beats" ${canRunBeats ? '' : 'disabled'}>${isProcessing ? '⏳ 任务进行中' : hasBeats ? '🎬 重新导演解析节拍' : '🎬 仅导演解析节拍'}</button>${isProcessing ? '<button class="nai-btn nai-btn-danger" data-action="cancel-job">⏹ 取消任务</button>' : ''}</div></footer>`;
}
