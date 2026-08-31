import { POSITIONS } from '../constants.js';
import { normalizeRoleType } from './roleType.js';

export function toSillyTavernWorldbook(entries, options = {}) {
  const sorted = [...(entries || [])].sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order || a.name.localeCompare(b.name));
  const output = sorted.map((entry, index) => {
    const position = POSITIONS.includes(entry.position) ? entry.position : 'before_char';
    const numericPosition = position === 'before_char' ? 0 : position === 'after_char' ? 1 : position === 'before_author' ? 2 : position === 'after_author' ? 3 : 4;
    return {
      uid: index,
      key: entry.keywords,
      keysecondary: [],
      comment: `${entry.category} - ${entry.name}`,
      content: entry.content,
      constant: !!entry.constant,
      selective: !entry.constant,
      selectiveLogic: 0,
      addMemo: true,
      order: entry.order,
      position: numericPosition,
      disable: false,
      ignoreBudget: false,
      excludeRecursion: true,
      preventRecursion: true,
      delayUntilRecursion: false,
      probability: 100,
      useProbability: true,
      depth: entry.depth,
      case_sensitive: false,
      caseSensitive: false,
      displayIndex: index,
      vectorized: false,
      sticky: null,
      cooldown: null,
      delay: null,
      group: `${entry.category}_${entry.name}`,
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      matchWholeWords: false,
      automationId: '',
      role: 0,
      extensions: {
        position: numericPosition, depth: entry.depth, display_index: index,
        exclude_recursion: true, prevent_recursion: true, delay_until_recursion: false,
        probability: 100, group: `${entry.category}_${entry.name}`, group_override: false,
        group_weight: 100, character_role_type: entry.category === '角色' ? normalizeRoleType(entry.content) : '',
        useProbability: true, selectiveLogic: 0, addMemo: true, vectorized: false, ignore_budget: false
      }
    };
  });
  return {
    entries: Object.fromEntries(output.map((entry) => [String(entry.uid), entry])),
    originalData: { name: options.name || 'NovelAI 世界书', description: '由 NovelAI 插件生成', version: 1, author: 'NovelAI' }
  };
}

export function toCharacterCard(entries, options = {}) {
  const worldbook = toSillyTavernWorldbook(entries, { name: `${options.name || 'NovelAI'}-世界书` });
  const characterEntries = Object.values(worldbook.entries).map((entry, index) => ({
    id: index,
    keys: entry.key || [],
    secondary_keys: entry.keysecondary || [],
    comment: entry.comment || '',
    content: entry.content || '',
    constant: !!entry.constant,
    selective: !!entry.selective,
    insertion_order: entry.order ?? 100,
    enabled: !entry.disable,
    position: entry.position === 1 ? 'after_char' : 'before_char',
    case_sensitive: !!entry.caseSensitive,
    name: entry.comment || `条目${index}`,
    priority: 10,
    extensions: {
      position: entry.position, exclude_recursion: !!entry.excludeRecursion, prevent_recursion: !!entry.preventRecursion,
      delay_until_recursion: !!entry.delayUntilRecursion, depth: entry.depth, selectiveLogic: entry.selectiveLogic,
      group: entry.group, group_override: !!entry.groupOverride, group_weight: entry.groupWeight, use_group_scoring: null,
      automation_id: entry.automationId, role: entry.role, vectorized: !!entry.vectorized, display_index: entry.displayIndex,
      probability: entry.probability, sticky: entry.sticky, cooldown: entry.cooldown, delay: entry.delay, addMemo: entry.addMemo,
      scan_depth: entry.scanDepth, match_whole_words: entry.matchWholeWords, character_role_type: entry.extensions?.character_role_type || ''
    }
  }));
  return {
    spec: 'chara_card_v2', spec_version: '2.0', data: {
      name: options.name || 'NovelAI 角色卡', description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
      creator_notes: '由 NovelAI 插件生成，世界书已绑定', system_prompt: '', post_history_instructions: '', alternate_greetings: [],
      character_book: { name: worldbook.originalData.name, description: '由 NovelAI 生成', scan_depth: 2, token_budget: 2048, recursive_scanning: false, extensions: {}, entries: characterEntries },
      tags: ['NovelAI', '自动生成'], creator: 'NovelAI', character_version: '1.0', extensions: { novelai_project: { projectId: options.projectId || null, schemaVersion: options.schemaVersion || 1 } }
    }
  };
}

export function toProjectPackage(project) {
  return structuredClone(project);
}
