export const SCHEMA_VERSION = 1;
export const EXTENSION_KEY = 'novelai';
export const PROJECT_STORAGE_KEY = 'novelai.project.v1';
export const DEFAULT_CHAPTER_REGEX = '^[\\s\\u3000\\uFEFF]*第\\s*[零一二三四五六七八九十百千万0-9]+\\s*[章回卷节部篇][^\\n\\r]{0,80}';
export const PROCESS_STATUS = Object.freeze({
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  EMPTY: 'empty',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  NEEDS_REVIEW: 'needs_review'
});
export const POSITIONS = Object.freeze(['before_char', 'after_char', 'before_author', 'after_author', 'depth']);
export const DEFAULT_MAIN_PROMPT = `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的特定类别信息，生成高质量的世界书条目。\n当前章节：{CHAPTER_TITLE}\n## 重要要求\n1. **必须基于提供的具体小说内容**，不要生成通用模板\n2. **只输出以下指定类别：{ENABLED_CATEGORY_NAMES}**，禁止输出其他未指定的分类\n3. **关键词必须是文中实际出现的名称**，用逗号分隔\n4. **内容必须基于原文描述**，不要添加原文没有的信息\n5.每一个类别的"内容"字段，**必须使用markdown格式**，可以层层嵌套或使用序号标题\n## 📤 输出格式\n请生成标准JSON格式，确保能被JavaScript正确解析：\n\n\`\`\`json\n{DYNAMIC_JSON_TEMPLATE}\n\`\`\`\n\n## 重要提醒\n- 直接输出JSON，不要包含代码块标记\n- 内容描述要完整但简洁\n- **严格只输出上述指定的分类，不要自作主张添加其他分类**`;
export const DEFAULT_CATEGORIES = Object.freeze([
  {
    id: 'character', name: '角色', enabled: true, order: 0,
    fields: ['真实姓名', '关键词', '性别', '年龄', '身份', '背景', '性格', '外貌', '重要事件', '背景故事'],
    prompt: `基于原文的角色描述，使用markdown格式，按以下字段组织：

**真实姓名**: 角色在文中的真实姓名（必填）
**关键词**：真实姓名、别称1、别称2（必填，最多五个）
**性别**: 男/女/其他
**年龄**: 实际年龄（若有明确说明）
**身份**: 在故事中的职业或社会地位（控制在30字内）
**背景**: 出身、家庭、成长经历等（控制在30字内）
**性格**: 核心性格特征（控制在30字内）
**外貌**: 显著外貌特征（控制在30字内）
**重要事件**: 参与的关键剧情节点
**背景故事**: 关键经历（控制在100字内）`,
    defaultConfig: { position: 'before_char', depth: 4, order: 100, autoIncrementOrder: true, constant: false }
  },
  {
    id: 'location', name: '地点', enabled: true, order: 1,
    fields: ['真实地名', '关键词', '位置', '特征', '相关角色'],
    prompt: `基于原文的地点描述，使用markdown格式，按以下字段组织：

**真实地名**: 地点在文中的真实名称（必填）
**关键词**：真实地名、别称1、别称2（必填，最多五个）
**位置**: 位于哪个区域/城市/国家，相对位置关系（控制在30字内）
**特征**: 外观、环境、气候、建筑风格等显著特点（控制在30字内）
**相关角色**: 常出没或居住于此的角色（控制在30字内）`,
    defaultConfig: { position: 'before_char', depth: 4, order: 200, autoIncrementOrder: true, constant: false }
  }
]);

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
