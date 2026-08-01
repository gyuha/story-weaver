import { describe, expect, it } from 'vitest';

import { parsePartialSuggestions, parseSuggestions } from '../parse-suggestions';

// 계약(task #62): 후보 하나 = JSON 객체 한 줄 `{"text":"..."}` (JSONL).
// 계약을 어긴 응답도 흡수하는 4계층 관용 — ① JSONL ② 코드펜스로 감싼 단일 JSON
// ③ 줄 시작 라벨(N. / **후보 N** / ### 후보 N) ④ 원문 1개.
// 각 계층은 실측된 실패 모드에 대응한다(로그 40% 라벨 표류, extraction_service 코드펜스 선례).

describe('parseSuggestions — 계층 ① JSONL', () => {
  it('JSON 객체 한 줄씩을 후보로 분리한다', () => {
    expect(parseSuggestions('{"text":"가"}\n{"text":"나"}\n{"text":"다"}')).toEqual([
      '가',
      '나',
      '다',
    ]);
  });

  it('후보 본문의 개행은 이스케이프되어 한 후보로 유지된다', () => {
    expect(parseSuggestions('{"text":"첫 줄\\n둘째 줄"}\n{"text":"나"}')).toEqual([
      '첫 줄\n둘째 줄',
      '나',
    ]);
  });

  it('빈 text나 깨진 줄은 건너뛴다', () => {
    expect(parseSuggestions('{"text":"가"}\n{"text":""}\n깨진 줄\n{"text":"나"}')).toEqual([
      '가',
      '나',
    ]);
  });
});

describe('parseSuggestions — 계층 ② 코드펜스로 감싼 단일 JSON', () => {
  it('```json 펜스를 벗기고 candidates 배열을 후보로 쓴다', () => {
    const raw = '```json\n{"candidates":["가","나"]}\n```';
    expect(parseSuggestions(raw)).toEqual(['가', '나']);
  });

  it('펜스 없는 candidates 객체도 받는다', () => {
    expect(parseSuggestions('{"candidates":["가","나","다"]}')).toEqual(['가', '나', '다']);
  });
});

describe('parseSuggestions — 계층 ③ 줄 시작 라벨(표류 흡수)', () => {
  it('**후보 N** 라벨을 경계로 쓴다', () => {
    expect(parseSuggestions('**후보 1**\n가\n\n**후보 2**\n나')).toEqual(['가', '나']);
  });

  it('### 후보 N 라벨을 경계로 쓴다', () => {
    expect(parseSuggestions('### 후보 1\n가\n### 후보 2\n나')).toEqual(['가', '나']);
  });

  it('맨 번호 N. / N) 을 경계로 쓴다', () => {
    expect(parseSuggestions('1. 가\n2. 나')).toEqual(['가', '나']);
    expect(parseSuggestions('1) 가\n2) 나')).toEqual(['가', '나']);
  });

  it('번호 뒤에 개행이 오는 변형도 받는다', () => {
    expect(parseSuggestions('1.\n가\n2.\n나')).toEqual(['가', '나']);
  });
});

describe('parseSuggestions — 계층 ④ 폴백과 오분할 방지', () => {
  it('아무 형식도 없으면 전체를 후보 1개로 본다', () => {
    expect(parseSuggestions('그냥 문장')).toEqual(['그냥 문장']);
  });

  it('빈 입력은 빈 배열', () => {
    expect(parseSuggestions('')).toEqual([]);
    expect(parseSuggestions('   ')).toEqual([]);
  });

  it('본문 속 일반 굵은 글씨는 경계가 아니다', () => {
    expect(parseSuggestions('가\n**강조**\n나')).toEqual(['가\n**강조**\n나']);
  });

  it('본문 속 일반 제목은 경계가 아니다', () => {
    expect(parseSuggestions('가\n## 소제목\n나')).toEqual(['가\n## 소제목\n나']);
  });

  it('인라인 라벨은 경계가 아니다', () => {
    expect(parseSuggestions('가 후보 2 나')).toEqual(['가 후보 2 나']);
  });
});

describe('parsePartialSuggestions — 스트리밍 증분', () => {
  it('완결된 JSONL 줄만 후보로 확정하고 마지막 미완결 줄은 자라는 중', () => {
    const result = parsePartialSuggestions('{"text":"가"}\n{"text":"나"}\n{"text":"다 쓰는', false);
    expect(result).toEqual({ completed: ['가', '나'], growing: true });
  });

  it('첫 줄이 아직 완결되지 않았으면 완성 0개', () => {
    const result = parsePartialSuggestions('{"text":"가 쓰는', false);
    expect(result).toEqual({ completed: [], growing: true });
  });

  it('원문을 후보로 내보내지 않는다(스트리밍 텍스트 노출 금지)', () => {
    const result = parsePartialSuggestions('아직 형식이 오지 않은 원문', false);
    expect(result).toEqual({ completed: [], growing: true });
  });

  it('빈 입력도 자라는 중으로 본다(모달 열림 직후 스켈레톤 유지)', () => {
    expect(parsePartialSuggestions('', false)).toEqual({ completed: [], growing: true });
  });

  it('isDone=true면 parseSuggestions와 동일한 결과', () => {
    const text = '{"text":"가"}\n{"text":"나"}';
    expect(parsePartialSuggestions(text, true)).toEqual({
      completed: parseSuggestions(text),
      growing: false,
    });
  });

  it('isDone=true면 형식 없는 응답도 후보 1개로 폴백', () => {
    expect(parsePartialSuggestions('그냥 문장', true)).toEqual({
      completed: ['그냥 문장'],
      growing: false,
    });
  });
});
