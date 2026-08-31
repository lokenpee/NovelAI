import { PROJECT_STORAGE_KEY, clone } from '../../domain/constants.js';
import { migrateProject } from '../../domain/project/migrateProject.js';
import { validateProject } from '../../domain/project/validateProject.js';

export class ProjectStore {
  constructor(adapter = {}) { this.adapter = adapter; this.memory = null; }

  async load() {
    let value;
    if (this.adapter.localforage) value = await this.adapter.localforage.getItem(PROJECT_STORAGE_KEY);
    else if (typeof localStorage !== 'undefined') value = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || 'null');
    else value = this.memory;
    if (!value) return null;
    const project = migrateProject(value);
    const errors = validateProject(project);
    if (errors.length) throw new Error(`已保存工程包损坏: ${errors.join('；')}`);
    this.memory = clone(project);
    return clone(project);
  }

  async save(project) {
    const errors = validateProject(project);
    if (errors.length) throw new Error(`工程包校验失败: ${errors.join('；')}`);
    const snapshot = clone(project);
    if (this.adapter.localforage) await this.adapter.localforage.setItem(PROJECT_STORAGE_KEY, snapshot);
    else if (typeof localStorage !== 'undefined') localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot));
    this.memory = snapshot;
    return clone(snapshot);
  }

  async clear() {
    if (this.adapter.localforage) await this.adapter.localforage.removeItem(PROJECT_STORAGE_KEY);
    else if (typeof localStorage !== 'undefined') localStorage.removeItem(PROJECT_STORAGE_KEY);
    this.memory = null;
  }
}
