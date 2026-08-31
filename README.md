# NovelAI SillyTavern 扩展

NovelAI 是一个原生 JS/CSS 的 SillyTavern 扩展，提供：

- TXT 导入、精确清洗、章节正则捕获与章节编辑
- 角色/地点/自定义类别世界书抽取、规范化合并、编辑与导出
- 章节节拍解析、故事大纲、当前章节概览和故事坐标
- 生成前导演拦截、演员执行单注入和回合提交
- OpenAI 兼容、Gemini、Anthropic 自定义路由，或直接使用酒馆 API；具备超时、限流重试、流式降级和 JSON Schema 兼容回退

## 安装

将整个目录复制到 SillyTavern 的 `public/extensions/third-party/NovelAI`（或当前用户的 `data/<user>/extensions/third-party/NovelAI`），确认 `manifest.json`、`index.js` 与 `src/` 位于同一层，然后重载 SillyTavern。

章节、世界书、节拍和处理进度保存到浏览器 IndexedDB（localforage），关闭抽屉或刷新页面后会恢复；轻量设置（路由、模型、超时、重试、并发和开关）保存到 SillyTavern `extensionSettings`。

API Key 与 StoryWeaver 一样保存在本插件的 SillyTavern `extensionSettings.novelai` 中，关闭抽屉或刷新后会恢复；不会写入工程包、角色卡、日志或 IndexedDB。请仅在自己信任的本机 SillyTavern 与扩展环境中使用此方式。

## 使用顺序

1. 在“TXT→世界书”导入 TXT，清洗并检查章节。
2. 在“生成结果”启用类别并提取世界书，编辑后导出世界书或角色卡。
3. 在“故事大纲”解析节拍，选择“从这一章开始”设置故事坐标。
4. 将导出的角色卡/世界书导入 SillyTavern 聊天；满足前置条件后，普通聊天生成会自动运行导演—演员链路。

## 开发

```text
npm test
```

领域逻辑位于 `src/domain`，平台/API/任务位于 `src/services`，UI 位于 `src/ui`，样式统一位于 `src/styles`。
