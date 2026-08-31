export function buildCategorySchema(categoryConfigs) {
  const enabled = (categoryConfigs || []).filter((category) => category.enabled);
  const properties = {};
  for (const category of enabled) {
    properties[category.name] = {
      type: 'object', additionalProperties: { type: 'object', properties: {
        关键词: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        内容: { type: 'string' }
      }, required: ['关键词', '内容'] }
    };
  }
  return { name: 'NovelAIWorldbook', strict: false, value: { type: 'object', properties, additionalProperties: false } };
}

export function buildDynamicTemplate(categoryConfigs) {
  const template = {};
  for (const category of (categoryConfigs || []).filter((item) => item.enabled)) {
    template[category.name] = { [category.fields[0] || '真实姓名']: { 关键词: ['名称或别称'], 内容: category.fields.map((field) => `**${field}**: ...`).join('\n') } };
  }
  return JSON.stringify(template, null, 2);
}
