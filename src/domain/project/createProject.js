import { clone, DEFAULT_CATEGORIES, DEFAULT_CHAPTER_REGEX, PROCESS_STATUS, SCHEMA_VERSION } from '../constants.js';

function makeProjectId() {
  return `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createProject(sourceText = '') {
  const categories = clone(DEFAULT_CATEGORIES);
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: makeProjectId(),
    version: 1,
    sourceText: String(sourceText),
    sourceVersion: 1,
    chapterRegex: DEFAULT_CHAPTER_REGEX,
    chapters: [],
    categoryConfigs: categories,
    worldbookEntries: [],
    beatAssets: [],
    processing: { worldbook: {}, beats: {}, overall: PROCESS_STATUS.PENDING },
    outline: {},
    runtime: {
      currentStage: null,
      previousStage: null,
      isNewbeat: false,
      isNewchapter: false,
      recentAssistantTail: '',
      lastUserInput: '',
      directorHistory: [],
      directorIndex: 0,
      pendingDecision: null,
      openingSentForStage: null
    },
    exports: { lastWorldbookAt: null, lastCharacterCardAt: null, exportVersion: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
