// Entity(웹 자유형) <-> EntityResponse/attributes(백엔드 정형) 변환.
// EntityField[]<->attributes 라벨 매핑 자체는 attributes-mapping.ts에 위임한다.
import type { EntityResponse } from '@/api';
import type { Entity, EntityField, EntityType } from '@/features/shared/types';
import { attributesToFields, fieldsToAttributes, toEntityType } from './attributes-mapping';

// eco: 백엔드 entities에는 emoji 컬럼이 없다(worldbible_schemas.py) — entity-form.tsx의
// DEFAULT_EMOJI와 동일한 유형별 기본값으로 표시(서버 조회 경로 전용, 새로고침 시 사용자가 고른
// 이모지는 유지되지 않음 — works.store.ts의 setWorkEntities가 기존 로컬 값이 있으면 보존).
const DEFAULT_EMOJI: Record<EntityType, string> = {
  인물: '👤',
  장소: '🏔️',
  사건: '⚔️',
  아이템: '🗡️',
};

/** 서버 응답(EntityResponse) → 웹 Entity. emoji/imageUrl/relations는 백엔드에 없어 호출부가 보완한다. */
export function fromEntityResponse(response: EntityResponse): Entity {
  const type = toEntityType(response.entityType);
  const entity: Entity = {
    id: response.id,
    type,
    name: response.name,
    emoji: DEFAULT_EMOJI[type],
    summary: response.summary,
    fields: attributesToFields(type, response.attributes),
  };
  const [alias] = response.aliases;
  if (alias) entity.alias = alias;
  if (type === '인물') {
    const sampleLines = response.attributes.sample_lines;
    if (Array.isArray(sampleLines)) {
      const strings = sampleLines.filter((v): v is string => typeof v === 'string');
      if (strings.length) entity.sampleLines = strings;
    }
  }
  return entity;
}

/**
 * EntityField[] + (인물 전용) sampleLines를 백엔드 attributes로 합성.
 * relations(인물)는 백엔드가 target_entity_id(UUID) 참조를 요구해 자유 텍스트 name/role/tone과
 * 형태가 달라 보내지 않는다 — 엔티티 연결 UI가 생기면(추후 작업) 재작업. eco.
 */
export function toAttributesPayload(
  type: EntityType,
  fields: EntityField[],
  sampleLines?: string[]
): Record<string, unknown> {
  const attributes = fieldsToAttributes(type, fields);
  if (type === '인물' && sampleLines?.length) attributes.sample_lines = sampleLines;
  return attributes;
}
