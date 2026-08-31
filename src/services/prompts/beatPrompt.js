export const DEFAULT_BEAT_PROMPT = `你是故事节拍解析器。请阅读以下章节，将其拆分为至少两个按原文顺序排列的完整事件节拍。输出 JSON：{"summary":"章节摘要","beats":[{"summary":"事件摘要","exitCondition":"退出条件","text":"该节拍对应的完整原文"}]}。首节拍必须从章节开头开始，末节拍必须到章节结尾。\n章节标题：{CHAPTER_TITLE}\n章节正文：\n{CHAPTER_TEXT}`;

export function buildBeatPrompt(chapter, template = DEFAULT_BEAT_PROMPT) {
  return template.replaceAll('{CHAPTER_TITLE}', chapter.chapterName).replaceAll('{CHAPTER_TEXT}', chapter.text);
}
