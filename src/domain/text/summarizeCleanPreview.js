function locateChapterStarts(sourceText, chapters) {
  const source = String(sourceText || '');
  let cursor = 0;
  return (chapters || []).map((chapter, index) => {
    const text = String(chapter.text || '').trim();
    let start = text ? source.indexOf(text, cursor) : -1;
    if (start < 0) start = source.indexOf(String(chapter.chapterName || ''), cursor);
    if (start < 0) start = cursor;
    cursor = Math.max(cursor, start + Math.max(1, text.length));
    return { chapterId: chapter.chapterId, chapterName: chapter.chapterName || `第${index + 1}章`, start };
  }).sort((a, b) => a.start - b.start);
}

export function summarizeCleanPreview(preview, { sourceText = '', chapters = [] } = {}) {
  const hits = Array.isArray(preview?.hits) ? preview.hits : [];
  const patterns = Array.isArray(preview?.patterns) ? preview.patterns : [];
  const chapterStarts = locateChapterStarts(sourceText, chapters);
  const chapterMap = new Map();
  const segmentMap = new Map(patterns.map((pattern) => [pattern, { segment: pattern, hits: 0, removedChars: 0 }]));

  for (const hit of hits) {
    const length = Math.max(0, Number(hit.end) - Number(hit.index));
    const segment = segmentMap.get(hit.pattern) || { segment: hit.pattern, hits: 0, removedChars: 0 };
    segment.hits += 1;
    segment.removedChars += length;
    segmentMap.set(hit.pattern, segment);

    let located = null;
    for (const chapter of chapterStarts) {
      if (chapter.start > hit.index) break;
      located = chapter;
    }
    if (located) {
      const stat = chapterMap.get(located.chapterId) || { ...located, hits: 0, removedChars: 0 };
      stat.hits += 1;
      stat.removedChars += length;
      chapterMap.set(located.chapterId, stat);
    }
  }

  return {
    totalHits: hits.length,
    totalRemovedChars: hits.reduce((sum, hit) => sum + Math.max(0, Number(hit.end) - Number(hit.index)), 0),
    patternCount: patterns.length,
    chapterStats: [...chapterMap.values()],
    segmentStats: [...segmentMap.values()].sort((a, b) => b.hits - a.hits),
    samples: hits.slice(0, 6).map((hit) => ({ index: hit.index, preview: String(hit.preview || '').replace(/\s+/g, ' ').trim() })),
  };
}
