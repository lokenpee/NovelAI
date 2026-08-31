import { DEFAULT_MAIN_PROMPT } from '../constants.js';
import { buildDynamicTemplate } from './categorySchema.js';

export function buildExtractionPrompt(chapter, categoryConfigs, mainPrompt = DEFAULT_MAIN_PROMPT) {
  const enabled = (categoryConfigs || []).filter((category) => category.enabled);
  if (!enabled.length) throw new Error('至少启用一个世界书类别');
  const categoryPrompts = enabled.map((category) => `## ${category.name}\n${category.prompt}\n允许字段：${category.fields.join('、')}`).join('\n\n');
  return String(mainPrompt)
    .replaceAll('{ENABLED_CATEGORY_NAMES}', enabled.map((category) => category.name).join('、'))
    .replaceAll('{DYNAMIC_JSON_TEMPLATE}', buildDynamicTemplate(enabled))
    .replaceAll('{CHAPTER_TITLE}', chapter.chapterName)
    .replaceAll('{CHAPTER_TEXT}', chapter.text)
    .replace('{第二百九十五章 山东指挥}', chapter.chapterName)
    + `\n\n${categoryPrompts}\n\n## 当前章节正文\n${chapter.text}`;
}

export function buildPromptPreview(categoryConfigs, mainPrompt = DEFAULT_MAIN_PROMPT) {
  const sample = { chapterName: '示例章节', text: '示例正文' };
  return buildExtractionPrompt(sample, categoryConfigs, mainPrompt);
}
