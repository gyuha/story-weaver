import type { EntityField, EntityType } from '@/features/shared/types';
import { describe, expect, it } from 'vitest';
import {
  attributesToFields,
  fieldsToAttributes,
  toApiEntityType,
  toEntityType,
} from '../attributes-mapping';

const FULL_FIELDS: Record<EntityType, EntityField[]> = {
  인물: [
    { label: '외모', value: '흑발, 붉은 눈' },
    { label: '성격', value: '냉철하다' },
    { label: '말투', value: '반말' },
  ],
  장소: [
    { label: '묘사', value: '절벽 위 문파' },
    { label: '지역', value: '북부' },
    { label: '분위기', value: '삭막함' },
  ],
  사건: [{ label: '묘사', value: '문파 멸망' }],
  아이템: [
    { label: '묘사', value: '천뢰검' },
    { label: '속성', value: '뇌속성' },
  ],
};

describe('toApiEntityType / toEntityType', () => {
  it('한글 EntityType과 백엔드 EntityType을 상호 변환한다', () => {
    expect(toApiEntityType('인물')).toBe('character');
    expect(toApiEntityType('장소')).toBe('location');
    expect(toApiEntityType('사건')).toBe('event');
    expect(toApiEntityType('아이템')).toBe('item');

    expect(toEntityType('character')).toBe('인물');
    expect(toEntityType('location')).toBe('장소');
    expect(toEntityType('event')).toBe('사건');
    expect(toEntityType('item')).toBe('아이템');
  });
});

describe('fieldsToAttributes / attributesToFields round-trip', () => {
  it.each(Object.keys(FULL_FIELDS) as EntityType[])(
    '%s: fields -> attributes -> fields가 데이터 손실 없이 원복된다',
    (type) => {
      const fields = FULL_FIELDS[type];
      const attributes = fieldsToAttributes(type, fields);
      expect(attributesToFields(type, attributes)).toEqual(fields);
    }
  );

  it('인물 라벨은 지정된 attributes 키로 매핑된다', () => {
    expect(fieldsToAttributes('인물', FULL_FIELDS.인물)).toEqual({
      appearance: '흑발, 붉은 눈',
      personality: '냉철하다',
      speech_style: '반말',
    });
  });

  it('빈 fields 배열은 빈 attributes를 반환한다', () => {
    expect(fieldsToAttributes('인물', [])).toEqual({});
    expect(attributesToFields('인물', {})).toEqual([]);
  });

  it('매핑되지 않는 라벨은 조용히 무시한다', () => {
    const fields: EntityField[] = [{ label: '알수없는필드', value: 'x' }];
    expect(fieldsToAttributes('인물', fields)).toEqual({});
  });

  it('백엔드가 UUID를 요구하는 참여자/발생 시점/소유자는 attributes에서 제외한다', () => {
    expect(
      fieldsToAttributes('사건', [
        { label: '참여자', value: '주인공, 사부' },
        { label: '발생 시점', value: '3화' },
      ])
    ).toEqual({});
    expect(fieldsToAttributes('아이템', [{ label: '소유자', value: '주인공' }])).toEqual({});
  });

  it('값이 빈 문자열인 필드는 attributes에서 제외한다', () => {
    const fields: EntityField[] = [{ label: '외모', value: '' }];
    expect(fieldsToAttributes('인물', fields)).toEqual({});
  });

  it('attributes에 없는 값(undefined/null/빈문자열)은 fields에서 제외한다', () => {
    expect(
      attributesToFields('인물', { appearance: '흑발', personality: null, speech_style: '' })
    ).toEqual([{ label: '외모', value: '흑발' }]);
  });

  it('attributes가 null/undefined여도 빈 배열을 반환한다', () => {
    expect(attributesToFields('인물', null)).toEqual([]);
    expect(attributesToFields('인물', undefined)).toEqual([]);
  });
});
