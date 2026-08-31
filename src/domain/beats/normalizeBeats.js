import { deriveBeatAssets, deriveBoundaryAssets } from './deriveBoundaryAssets.js';
import { validateBeatAsset } from './validateBeatAsset.js';

export function normalizeBeats(chapter, parsed) {
  const errors = validateBeatAsset(chapter, parsed);
  if (errors.length) return { errors, asset: null };
  const beats = parsed.beats.map((beat, index) => {
    const text = String(beat.text || beat.original || beat.content).trim();
    return {
      beatId: `b${index + 1}`, order: index,
      summary: String(beat.summary || beat.eventSummary).trim(),
      exitCondition: String(beat.exitCondition || beat.exit_condition).trim(),
      text, ...deriveBeatAssets(text)
    };
  });
  const boundary = deriveBoundaryAssets(chapter.text);
  beats[0].opening = boundary.opening;
  beats.at(-1).ending = boundary.ending;
  return { errors: [], asset: { chapterId: chapter.chapterId, chapterName: chapter.chapterName, summary: String(parsed.summary || parsed.storySummary).trim(), opening: boundary.opening, ending: boundary.ending, beats, version: chapter.sourceVersion } };
}
