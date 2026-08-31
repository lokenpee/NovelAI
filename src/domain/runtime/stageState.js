export function stageToArray(stage) { return stage ? [stage.chapterId, stage.beatId] : null; }

export function findBeat(beatAssets, stage) {
  const chapterAsset = (beatAssets || []).find((asset) => asset.chapterId === stage?.chapterId);
  const beat = chapterAsset?.beats?.find((item) => item.beatId === stage?.beatId);
  return { chapterAsset, beat };
}

export function validateStage(beatAssets, stage) {
  if (!stage || !Number.isInteger(stage.chapterId) || !stage.beatId) return false;
  return !!findBeat(beatAssets, stage).beat;
}

export function setStage(runtime, beatAssets, nextStage, reason = 'manual') {
  if (!validateStage(beatAssets, nextStage)) throw new Error('故事坐标无效，请先生成并确认节拍');
  const previous = runtime.currentStage || null;
  const isNewbeat = !previous || previous.chapterId !== nextStage.chapterId || previous.beatId !== nextStage.beatId;
  const isNewchapter = !previous || previous.chapterId !== nextStage.chapterId;
  return { ...runtime, currentStage: { chapterId: nextStage.chapterId, beatId: nextStage.beatId }, previousStage: previous, isNewbeat, isNewchapter, stageChangeReason: reason };
}

export function startFromChapter(runtime, beatAssets, chapterId) {
  const asset = (beatAssets || []).find((item) => item.chapterId === chapterId);
  if (!asset?.beats?.length) throw new Error('该章节没有有效节拍');
  return setStage(runtime, beatAssets, { chapterId, beatId: asset.beats[0].beatId }, 'start_chapter');
}

export function moveBeat(runtime, beatAssets, direction) {
  const current = runtime.currentStage;
  if (!current) throw new Error('尚未设置故事坐标');
  const chapterAsset = (beatAssets || []).find((asset) => asset.chapterId === current.chapterId);
  const index = chapterAsset?.beats?.findIndex((beat) => beat.beatId === current.beatId) ?? -1;
  const next = chapterAsset?.beats?.[index + direction];
  if (!next) return runtime;
  return setStage(runtime, beatAssets, { chapterId: current.chapterId, beatId: next.beatId }, direction > 0 ? 'next_beat' : 'previous_beat');
}

export function commitActorTurn(runtime, beatAssets, actorText, decision) {
  const openingSentForStage = runtime.isNewchapter && runtime.currentStage ? `${runtime.currentStage.chapterId}:${runtime.currentStage.beatId}` : runtime.openingSentForStage;
  const next = { ...runtime, recentAssistantTail: String(actorText || '').slice(-100), pendingDecision: null, openingSentForStage, isNewbeat: false, isNewchapter: false };
  if (!decision?.will_complete_this_turn || !runtime.currentStage) return next;
  const chapterAsset = beatAssets.find((asset) => asset.chapterId === runtime.currentStage.chapterId);
  const index = chapterAsset?.beats?.findIndex((beat) => beat.beatId === runtime.currentStage.beatId) ?? -1;
  const following = chapterAsset?.beats?.[index + 1];
  if (following) return setStage(next, beatAssets, { chapterId: runtime.currentStage.chapterId, beatId: following.beatId }, 'director_complete');
  return next;
}
