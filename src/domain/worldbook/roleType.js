export function normalizeRoleType(value) {
  const text = String(value || '').trim();
  if (text.includes('主角')) return '主角';
  if (text.includes('重要配角')) return '重要配角';
  if (text.includes('普通配角') || text.includes('配角')) return '普通配角';
  if (/NPC|路人|龙套/i.test(text)) return 'NPC';
  return '';
}
