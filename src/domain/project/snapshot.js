import { clone } from '../constants.js';
import { validateProject } from './validateProject.js';

export function createSnapshot(project, mutate) {
  const next = clone(project);
  mutate(next);
  next.version = (Number(project.version) || 0) + 1;
  next.updatedAt = Date.now();
  const errors = validateProject(next);
  if (errors.length) throw new Error(`项目校验失败: ${errors.join('；')}`);
  return next;
}
