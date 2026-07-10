import { describe, expect, it } from 'vitest';

import { parseSuggestions } from '../parse-suggestions';

describe('parseSuggestions', () => {
  it('번호(N.) 마커로 후보를 분리한다', () => {
    expect(parseSuggestions('1. 가\n2. 나\n3. 다')).toEqual(['가', '나', '다']);
  });

  it('번호(N)) 괄호형 마커로도 분리한다', () => {
    expect(parseSuggestions('1) 가\n2) 나')).toEqual(['가', '나']);
  });

  it('마커가 없으면 전체 텍스트를 trim해 단일 후보로 폴백한다', () => {
    expect(parseSuggestions('그냥 문장')).toEqual(['그냥 문장']);
  });

  it('첫 마커 이전의 프리앰블 텍스트는 버린다', () => {
    expect(parseSuggestions('후보:\n1. 가\n2. 나')).toEqual(['가', '나']);
  });

  it('각 후보의 접두와 앞뒤 공백을 제거한다', () => {
    expect(parseSuggestions('1.   가  \n2.  나   ')).toEqual(['가', '나']);
  });

  it('빈 문자열/공백뿐인 입력은 빈 배열을 반환한다', () => {
    expect(parseSuggestions('')).toEqual([]);
    expect(parseSuggestions('   ')).toEqual([]);
  });
});
