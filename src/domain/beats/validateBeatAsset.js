export function validateBeatAsset(chapter, parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object') return ['节拍结果不是对象'];
  if (!String(parsed.summary || parsed.storySummary || '').trim()) errors.push('缺少故事摘要');
  const beats = Array.isArray(parsed.beats) ? parsed.beats : [];
  if (beats.length < 2) errors.push('节拍数量必须至少为 2');
  for (const [index, beat] of beats.entries()) {
    if (!String(beat.summary || beat.eventSummary || '').trim()) errors.push(`节拍 ${index + 1} 缺少事件摘要`);
    if (!String(beat.exitCondition || beat.exit_condition || '').trim()) errors.push(`节拍 ${index + 1} 缺少退出条件`);
    if (!String(beat.text || beat.original || beat.content || '').trim()) errors.push(`节拍 ${index + 1} 缺少节拍原文`);
  }
  const firstText = String(beats[0]?.text || beats[0]?.original || beats[0]?.content || '').trim();
  const lastText = String(beats.at(-1)?.text || beats.at(-1)?.original || beats.at(-1)?.content || '').trim();
  if (firstText && !String(chapter.text).trim().startsWith(firstText.slice(0, Math.min(firstText.length, 30)))) errors.push('首节拍开头与章节开头不一致');
  if (lastText && !String(chapter.text).trim().endsWith(lastText.slice(-Math.min(lastText.length, 30)))) errors.push('末节拍结尾与章节结尾不一致');
  return errors;
}
