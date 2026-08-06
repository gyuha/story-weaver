import { describe, expect, it } from 'vitest';
import {
  dateGroupLabel,
  formatCharDelta,
  formatClockTime,
  formatRelativeTime,
} from '../version-time';

describe('formatClockTime', () => {
  it('24시간제 HH:MM으로 포맷한다', () => {
    expect(formatClockTime('2026-08-05T14:32:00')).toBe('14:32');
    expect(formatClockTime('2026-08-05T09:05:00')).toBe('09:05');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-05T14:35:00');

  it('1분 미만은 방금 전', () => {
    expect(formatRelativeTime('2026-08-05T14:34:40', now)).toBe('방금 전');
  });

  it('분 단위', () => {
    expect(formatRelativeTime('2026-08-05T14:32:00', now)).toBe('3분 전');
  });

  it('시간 단위(60분 이상, 24시간 미만)', () => {
    expect(formatRelativeTime('2026-08-05T11:04:00', now)).toBe('3시간 전');
  });

  it('일 단위(24시간 이상)', () => {
    expect(formatRelativeTime('2026-08-03T14:35:00', now)).toBe('2일 전');
  });
});

describe('dateGroupLabel — 달력일(자정) 기준, 경과 시간 기준 아님', () => {
  it('자정을 막 넘긴 항목은 몇 분 전이어도 오늘이다', () => {
    const now = new Date('2026-08-06T00:10:00');
    expect(dateGroupLabel('2026-08-06T00:05:00', now)).toBe('오늘'); // 5분 전
  });

  it('자정 직전 항목은 몇 분 안 지났어도 어제다', () => {
    const now = new Date('2026-08-06T00:10:00');
    expect(dateGroupLabel('2026-08-05T23:55:00', now)).toBe('어제'); // 15분 전인데 날짜는 어제
  });

  it('이틀 이상 전은 MM-DD', () => {
    const now = new Date('2026-08-06T00:10:00');
    expect(dateGroupLabel('2026-08-04T23:41:00', now)).toBe('08-04');
  });
});

describe('formatCharDelta', () => {
  it('양수는 + 부호와 쉼표 구분', () => {
    expect(formatCharDelta(128)).toBe('+128');
    expect(formatCharDelta(1102)).toBe('+1,102');
  });

  it('음수는 U+2212 마이너스 기호', () => {
    expect(formatCharDelta(-410)).toBe('−410');
  });

  it('0은 양수 쪽(+)으로 취급', () => {
    expect(formatCharDelta(0)).toBe('+0');
  });
});
