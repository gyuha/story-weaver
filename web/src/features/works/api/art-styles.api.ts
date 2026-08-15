// works(작품 화풍) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// list/work/update는 생성된 queryOptions/mutationOptions를 그대로 도메인 이름으로 재노출한다
// (works.api.ts의 worksQueries/worksMutations와 동일 패턴).
import { getApiV1WorksByWorkIdEntitiesByEntityIdImages } from '@/api';
import {
  getApiV1ArtStylesOptions,
  getApiV1WorksByWorkIdArtStyleOptions,
  putApiV1WorksByWorkIdArtStyleMutation,
} from '@/api/@tanstack/react-query.gen';

export const artStylesQueries = {
  list: getApiV1ArtStylesOptions,
  work: getApiV1WorksByWorkIdArtStyleOptions,
};

export const artStylesMutations = {
  update: putApiV1WorksByWorkIdArtStyleMutation,
};

/**
 * 작품의 엔티티 중 이미지가 하나라도 있는지 확인한다. 작품 전체 이미지 수를 한 번에 주는
 * 벌크 엔드포인트가 없어(비목표) 카드별 조회를 병렬로 돌려 존재 여부만 판단한다
 * (정확한 총량 N은 얻지 않는다 — 화면 문구가 "이미 만든 이미지는 그대로 남고…"인 이유).
 */
export async function hasAnyEntityImages(workId: string, entityIds: string[]): Promise<boolean> {
  const results = await Promise.all(
    entityIds.map((entityId) =>
      getApiV1WorksByWorkIdEntitiesByEntityIdImages({
        path: { work_id: workId, entity_id: entityId },
        throwOnError: true,
      }).then(({ data }) => data.length > 0)
    )
  );
  return results.some(Boolean);
}
