export function invalidateChapterAssets(project, chapterIds) {
  const ids = new Set(chapterIds);
  project.beatAssets = project.beatAssets.filter((asset) => !ids.has(asset.chapterId));
  for (const id of ids) {
    project.processing.worldbook[id] = { status: 'needs_review', updatedAt: Date.now() };
    project.processing.beats[id] = { status: 'needs_review', updatedAt: Date.now() };
  }
  project.worldbookEntries = project.worldbookEntries
    .filter((entry) => !(entry.sourceChapterIds || []).some((id) => ids.has(id)) || (entry.sourceChapterIds || []).some((id) => !ids.has(id)))
    .map((entry) => ({ ...entry, sourceChapterIds: (entry.sourceChapterIds || []).filter((id) => !ids.has(id)) }));
  if (project.runtime.currentStage && ids.has(project.runtime.currentStage.chapterId)) project.runtime.currentStage = null;
  return project;
}
