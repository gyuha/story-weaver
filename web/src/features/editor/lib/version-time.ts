// 버전 기록 목록의 상대 시각·날짜 그룹·글자 수 증감 표시 유틸.
// eco: 저장소에 상대 시각 포맷 유틸이 없었다(기존 "12분 전" 등은 하드코딩 목업) — Date만으로 충분해
// 새 의존성을 추가하지 않는다. `now`를 인자로 받아 순수 함수로 두어 시각 고정 없이도 테스트 가능하다.
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 절대 시각 — 24시간제 "HH:MM". */
export function formatClockTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 상대 시각 — "방금 전"/"N분 전"/"N시간 전"/"N일 전". */
export function formatRelativeTime(iso: string, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

/**
 * 날짜 그룹 헤더 — "오늘"/"어제"/"MM-DD". 달력일(자정) 기준이라 경과 시간이 아니라
 * 실제 날짜가 갈린다 — 자정을 5분 넘긴 항목은 "23시간 넘게 지나야 어제"가 아니라 바로 오늘이다.
 */
export function dateGroupLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 글자 수 증감 — "+128" / "−410"(마이너스 기호 U+2212, 자릿수 쉼표 포함). */
export function formatCharDelta(delta: number): string {
  const abs = Math.abs(delta).toLocaleString('ko-KR');
  return delta >= 0 ? `+${abs}` : `−${abs}`;
}
