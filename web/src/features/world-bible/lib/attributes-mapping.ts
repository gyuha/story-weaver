// 웹의 자유형 EntityField[](label/value) <-> 백엔드 EntityResponse/EntityCreate의 정형 attributes(JSONB) 매핑.
// 라벨은 entity-form.tsx의 TYPE_FIELDS와 동일하게 유지한다(docs/data-model.md 3.2).
import type { EntityType as ApiEntityType } from '@/api';
import type { EntityField, EntityType } from '@/features/shared/types';

/** 웹 EntityType(한글) <-> 백엔드 EntityType */
const TYPE_TO_API: Record<EntityType, ApiEntityType> = {
  인물: 'character',
  장소: 'location',
  사건: 'event',
  아이템: 'item',
};

const API_TO_TYPE: Record<ApiEntityType, EntityType> = {
  character: '인물',
  location: '장소',
  event: '사건',
  item: '아이템',
};

export function toApiEntityType(type: EntityType): ApiEntityType {
  return TYPE_TO_API[type];
}

export function toEntityType(apiType: ApiEntityType): EntityType {
  return API_TO_TYPE[apiType];
}

/**
 * 유형별 라벨 <-> attributes 키 매핑 (순서 = entity-form.tsx TYPE_FIELDS 표시 순서).
 *   인물   외모→appearance, 성격→personality, 말투→speech_style
 *   장소   묘사→description, 지역→region, 분위기→atmosphere
 *   사건   묘사→description
 *   아이템 묘사→description, 속성→properties
 * (인물 attributes의 sample_lines/relations는 Entity.sampleLines/relations로 이미 별도 필드라 여기서 다루지 않음)
 *
 * 사건.참여자→participants(list[uuid]), 사건.발생 시점→occurred_at_scene(uuid),
 * 아이템.소유자→owner(uuid)는 매핑에서 제외한다 — 백엔드 attributes 스키마(worldbible_schemas.py)가
 * UUID 참조를 요구하는데 웹 폼은 자유 텍스트 입력이라 그대로 보내면 항상 422가 난다. 엔티티/씬을
 * 고르는 연결 UI가 생기기 전까지는 미매핑 라벨과 동일하게 조용히 무시(eco) — 입력창은 그대로 유지되나
 * 저장되지 않는다.
 */
const FIELD_KEY_MAP: Record<EntityType, Record<string, string>> = {
  인물: { 외모: 'appearance', 성격: 'personality', 말투: 'speech_style' },
  장소: { 묘사: 'description', 지역: 'region', 분위기: 'atmosphere' },
  사건: { 묘사: 'description' },
  아이템: { 묘사: 'description', 속성: 'properties' },
};

/** EntityField[] → 백엔드 attributes. 매핑에 없는 라벨·빈 값은 무시(eco: 알려진 필드만 전송). */
export function fieldsToAttributes(
  type: EntityType,
  fields: EntityField[]
): Record<string, unknown> {
  const keyMap = FIELD_KEY_MAP[type];
  const attributes: Record<string, unknown> = {};
  for (const field of fields) {
    const key = keyMap[field.label];
    if (key && field.value) attributes[key] = field.value;
  }
  return attributes;
}

/** 백엔드 attributes → EntityField[] (TYPE_FIELDS 순서). 비어있거나 문자열이 아닌 값은 제외. */
export function attributesToFields(
  type: EntityType,
  attributes: Record<string, unknown> | null | undefined
): EntityField[] {
  const keyMap = FIELD_KEY_MAP[type];
  const fields: EntityField[] = [];
  for (const [label, key] of Object.entries(keyMap)) {
    const value = attributes?.[key];
    if (typeof value === 'string' && value) fields.push({ label, value });
  }
  return fields;
}
