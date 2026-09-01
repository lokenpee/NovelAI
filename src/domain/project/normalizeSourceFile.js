export function normalizeSourceFile(value) {
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim();
  if (!name) return null;
  const size = Number(value.size);
  const lastModified = Number(value.lastModified);
  const encoding = String(value.encoding || '').trim().toUpperCase();
  return {
    name,
    size: Number.isFinite(size) && size >= 0 ? Math.trunc(size) : null,
    lastModified: Number.isFinite(lastModified) && lastModified > 0 ? Math.trunc(lastModified) : null,
    encoding: encoding || null,
  };
}
