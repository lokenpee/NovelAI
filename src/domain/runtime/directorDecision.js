const LEVELS = new Set(['normal', 'soft_conflict', 'hard_conflict']);

export function extractJson(text) {
  const source = String(text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const start = source.indexOf('{');
  if (start < 0) return null;
  let depth = 0; let quote = false; let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quote = false; continue; }
    if (c === '"') quote = true;
    else if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

export function normalizeDirectorDecision(text, stage, index) {
  const raw = extractJson(text);
  if (!raw) return fallbackDecision(stage, index);
  try {
    const parsed = JSON.parse(raw);
    const direction = typeof parsed.direction_script === 'string' ? { action_chain: parsed.direction_script } : parsed.direction_script;
    if (!direction || typeof direction.action_chain !== 'string' || !direction.action_chain.trim()) return fallbackDecision(stage, index);
    const level = LEVELS.has(parsed.conflict_level) ? parsed.conflict_level : 'normal';
    const last = parsed.will_complete_this_last_turn === true;
    return {
      stage_idx: [stage.chapterId, stage.beatId], director_index: index,
      conflict_level: level, conflict_reason: String(parsed.conflict_reason || ''), conflict_strategy: String(parsed.conflict_strategy || ''),
      will_complete_this_last_turn: last, will_complete_this_turn: last || parsed.will_complete_this_turn === true,
      beat_complete_reason: String(parsed.beat_complete_reason || ''), direction_script: { action_chain: direction.action_chain.trim() }
    };
  } catch { return fallbackDecision(stage, index); }
}

export function fallbackDecision(stage, index) {
  return { stage_idx: [stage.chapterId, stage.beatId], director_index: index, conflict_level: 'normal', conflict_reason: '', conflict_strategy: '按当前节拍正常推进并吸收用户动作', will_complete_this_last_turn: false, will_complete_this_turn: false, beat_complete_reason: '', direction_script: { action_chain: '承接当前画面与用户动作→保持节拍内的局部反应→留下可承接的叙事钩子' } };
}
