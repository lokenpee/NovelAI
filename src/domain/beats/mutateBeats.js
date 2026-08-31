import { deriveBeatAssets } from './deriveBoundaryAssets.js';
import { validateBeatAsset } from './validateBeatAsset.js';

export function updateBeatAsset(chapter, asset, beatId, changes) {
  const next = structuredClone(asset);
  const index = next.beats.findIndex((beat) => beat.beatId === beatId);
  if (index < 0) throw new Error(`节拍不存在: ${beatId}`);
  const current = next.beats[index];
  const text = String(changes.text ?? current.text).trim();
  next.beats[index] = { ...current, summary: String(changes.summary ?? current.summary).trim(), exitCondition: String(changes.exitCondition ?? current.exitCondition).trim(), text, ...deriveBeatAssets(text) };
  const errors = validateBeatAsset(chapter, { summary: next.summary, beats: next.beats });
  if (errors.length) throw new Error(`节拍编辑未通过边界校验: ${errors.join('；')}`);
  return next;
}

export function mergeAdjacentBeatAsset(chapter, asset, beatId, direction = 'next') {
  const next = structuredClone(asset);
  const index = next.beats.findIndex((beat) => beat.beatId === beatId);
  const otherIndex = direction === 'previous' ? index - 1 : index + 1;
  if (index < 0 || otherIndex < 0 || otherIndex >= next.beats.length) throw new Error('没有可合并的相邻节拍');
  const keepIndex = direction === 'previous' ? otherIndex : index;
  const removeIndex = direction === 'previous' ? index : otherIndex;
  const keep = next.beats[keepIndex]; const remove = next.beats[removeIndex];
  const text = `${keep.text.trimEnd()}${remove.text.trimStart()}`;
  next.beats[keepIndex] = { ...keep, summary: `${keep.summary}；${remove.summary}`, exitCondition: remove.exitCondition, text, ...deriveBeatAssets(text) };
  next.beats.splice(removeIndex, 1);
  next.beats = next.beats.map((beat, order) => ({ ...beat, beatId: `b${order + 1}`, order }));
  const errors = validateBeatAsset(chapter, { summary: next.summary, beats: next.beats });
  if (errors.length) throw new Error(`节拍合并未通过边界校验: ${errors.join('；')}`);
  return next;
}

export function moveBeatAsset(chapter, asset, beatId, direction) {
  const next = structuredClone(asset);
  const index = next.beats.findIndex((beat) => beat.beatId === beatId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= next.beats.length) throw new Error('没有可交换的相邻节拍');
  [next.beats[index], next.beats[targetIndex]] = [next.beats[targetIndex], next.beats[index]];
  next.beats = next.beats.map((beat, order) => ({ ...beat, beatId: `b${order + 1}`, order }));
  const errors = validateBeatAsset(chapter, { summary: next.summary, beats: next.beats });
  if (errors.length) throw new Error(`节拍重排未通过边界校验: ${errors.join('；')}`);
  return next;
}
