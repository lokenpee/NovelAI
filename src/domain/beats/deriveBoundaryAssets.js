function sentences(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[。！？!?；;])\s*/u).filter(Boolean);
}

function takeSentences(items, fromEnd = false) {
  const selected = fromEnd ? items.slice(-2) : items.slice(0, 2);
  let value = selected.join('');
  if (value.length > 100) value = value.slice(0, 100);
  return value;
}

export function deriveBoundaryAssets(text) {
  const parts = sentences(text);
  return { opening: takeSentences(parts), ending: takeSentences(parts, true) };
}

export function deriveBeatAssets(beatText) {
  const assets = deriveBoundaryAssets(beatText);
  return { ...assets, text: String(beatText ?? '') };
}
