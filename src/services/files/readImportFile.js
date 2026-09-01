const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;
const TEXT_ENCODINGS = ['utf-8', 'gb18030', 'big5'];

function decodeText(buffer) {
  for (const encoding of TEXT_ENCODINGS) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      if (!text.includes('\uFFFD')) return { text: text.replace(/^\uFEFF/, ''), encoding: encoding.toUpperCase() };
    } catch {
      // Try the next supported encoding.
    }
  }
  const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
  return { text, encoding: 'UTF-8' };
}

export async function readImportFile(file, { maxBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('未选择有效文件');
  const name = String(file.name || '').trim();
  const extension = name.split('.').pop()?.toLowerCase();
  if (!['txt', 'json'].includes(extension)) throw new Error('仅支持 TXT 或本插件工程包 JSON');
  if (Number(file.size) > maxBytes) throw new Error(`文件不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`);

  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) throw new Error('文件内容为空');
  const decoded = decodeText(buffer);
  if (!decoded.text.trim()) throw new Error('文件没有可读取的文本内容');
  return { ...decoded, kind: extension };
}

export { DEFAULT_MAX_FILE_BYTES };
