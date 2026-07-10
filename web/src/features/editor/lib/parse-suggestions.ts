const MARKER = /(?:^|\n)\s*\d+[.)]\s*/g;

/** AI 이어쓰기 응답 텍스트를 "N." / "N)" 마커 기준 후보 배열로 분리한다. */
export function parseSuggestions(text: string): string[] {
  if (!text.trim()) return [];

  const markers = [...text.matchAll(MARKER)];
  if (markers.length < 2) return [text.trim()];

  const candidates: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    const candidate = text.slice(start, end).trim();
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}
