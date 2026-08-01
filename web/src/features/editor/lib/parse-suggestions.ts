// AI 이어쓰기 후보 파서 (task #62).
//
// 계약: 후보 하나 = JSON 객체 한 줄 `{"text":"..."}` (JSONL). 백엔드 프롬프트가 이 형식을
// 지시한다. JSONL을 고른 이유는 후보 본문의 개행이 JSON 문자열 안에서 \n으로 이스케이프되어
// **줄 경계와 절대 충돌하지 않기** 때문이다 — 구분자나 번호는 본문에 같은 패턴이 나오면
// 오분할 위험이 남는다. 줄마다 완결되므로 스트리밍 중 증분 파싱도 가능하다.
//
// 계약을 어긴 응답도 흡수하는 4계층 관용. 각 계층은 **실측된** 실패 모드에 대응한다:
//   ① JSONL 줄            — 지시 형식(실측 준수)
//   ② 코드펜스 감싼 JSON  — extraction_service가 이미 방어 코드를 가진 모드
//   ③ 줄 시작 라벨        — DB 로그로 40% 실측된 표류(`1.` / `**후보 N**` / `### 후보 N`)
//   ④ 원문 1개            — 최후 폴백
// 일반 굵은 글씨·일반 제목·인라인 라벨은 경계가 아니다(오분할 방지).

/** 계층 ③ — 줄 시작의 좁은 라벨만 후보 경계로 인정한다. `후보`+숫자 조합 또는 맨 번호. */
const LABEL =
  /(?:^|\n)[ \t]*(?:\*\*[ \t]*후보[ \t]*\d+[ \t]*\*\*|#{1,6}[ \t]*후보[ \t]*\d+|\d+[.)])[ \t]*/g;

const CODE_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;

/** 한 줄이 `{"text":"..."}` 형태면 그 본문을, 아니면 null. */
function parseJsonlLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (value && typeof value === 'object' && 'text' in value) {
      const text = (value as { text: unknown }).text;
      if (typeof text === 'string' && text.trim()) return text;
    }
  } catch {
    return null;
  }
  return null;
}

/** 계층 ② — 코드펜스를 벗긴 뒤 `{"candidates":[...]}` 형태면 그 배열을, 아니면 null. */
function parseCandidatesObject(text: string): string[] | null {
  const unfenced = (CODE_FENCE.exec(text.trim())?.[1] ?? text).trim();
  if (!unfenced.startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(unfenced);
    if (value && typeof value === 'object' && 'candidates' in value) {
      const list = (value as { candidates: unknown }).candidates;
      if (Array.isArray(list)) {
        const texts = list.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
        if (texts.length) return texts;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** 계층 ③ — 라벨을 경계로 자른다. 라벨이 2개 미만이면 null(경계로 볼 근거가 없다). */
function parseByLabel(text: string): string[] | null {
  const labels = [...text.matchAll(LABEL)];
  if (labels.length < 2) return null;

  const candidates: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    const start = labels[i].index + labels[i][0].length;
    const end = i + 1 < labels.length ? labels[i + 1].index : text.length;
    const candidate = text.slice(start, end).trim();
    if (candidate) candidates.push(candidate);
  }
  return candidates.length ? candidates : null;
}

/** 완료된 응답 텍스트를 후보 배열로 분리한다(4계층 관용, 위 주석 참조). */
export function parseSuggestions(text: string): string[] {
  if (!text.trim()) return [];

  const jsonl = text
    .split('\n')
    .map(parseJsonlLine)
    .filter((v): v is string => v !== null);
  if (jsonl.length) return jsonl;

  return parseCandidatesObject(text) ?? parseByLabel(text) ?? [text.trim()];
}

export interface PartialSuggestions {
  /** 경계가 확정된 완성 후보. */
  completed: string[];
  /** 아직 자라는 중인 후보가 있는지(스켈레톤 표시 여부). */
  growing: boolean;
}

/**
 * 스트리밍 중인 부분 텍스트에서 "경계가 확정된" 완성 후보만 골라낸다.
 *
 * JSONL은 개행이 곧 경계이므로 **마지막 줄은 아직 자라는 중**으로 보고 그 앞의 완결된
 * 줄만 후보로 확정한다. 스트리밍 중에는 원문을 절대 후보로 내보내지 않는다 — 그러면
 * 스트리밍 텍스트가 그대로 노출된다. 형식이 아직 오지 않았으면 완성 0개 + growing이고,
 * 완료 시점에 :func:`parseSuggestions`의 폴백 계층이 작동한다.
 */
export function parsePartialSuggestions(text: string, isDone: boolean): PartialSuggestions {
  if (isDone) {
    return { completed: parseSuggestions(text), growing: false };
  }

  const lines = text.split('\n');
  const settled = lines.slice(0, -1); // 마지막 줄은 개행이 오지 않았으므로 미완결
  const completed = settled.map(parseJsonlLine).filter((v): v is string => v !== null);
  return { completed, growing: true };
}
