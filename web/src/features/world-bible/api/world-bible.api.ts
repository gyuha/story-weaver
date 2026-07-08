// world-bible(엔티티 카드·씬-엔티티 링크·타임라인 상태) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query/mutation option은 도메인 이름으로 다시 노출한다.
import {
  type DeleteApiV1WorksByWorkIdEntitiesByEntityIdData,
  type DeleteApiV1WorksByWorkIdScenesBySceneIdLinksByEntityIdData,
  type GetApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesData,
  type GetApiV1WorksByWorkIdEntitiesData,
  type GetApiV1WorksByWorkIdScenesBySceneIdLinksData,
  type Options,
  type PatchApiV1WorksByWorkIdEntitiesByEntityIdData,
  type PostApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesData,
  type PostApiV1WorksByWorkIdEntitiesData,
  type PostApiV1WorksByWorkIdScenesBySceneIdLinksData,
  deleteApiV1WorksByWorkIdEntitiesByEntityId,
  deleteApiV1WorksByWorkIdScenesBySceneIdLinksByEntityId,
  getApiV1WorksByWorkIdEntities,
  getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStates,
  getApiV1WorksByWorkIdScenesBySceneIdLinks,
  patchApiV1WorksByWorkIdEntitiesByEntityId,
  postApiV1WorksByWorkIdEntities,
  postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStates,
  postApiV1WorksByWorkIdScenesBySceneIdLinks,
} from '@/api';
import {
  deleteApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  deleteApiV1WorksByWorkIdScenesBySceneIdLinksByEntityIdMutation,
  getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesOptions,
  getApiV1WorksByWorkIdEntitiesOptions,
  getApiV1WorksByWorkIdScenesBySceneIdLinksOptions,
  patchApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesMutation,
  postApiV1WorksByWorkIdEntitiesMutation,
  postApiV1WorksByWorkIdScenesBySceneIdLinksMutation,
} from '@/api/@tanstack/react-query.gen';

export const worldBibleApi = {
  async entities(options: Options<GetApiV1WorksByWorkIdEntitiesData>) {
    const { data } = await getApiV1WorksByWorkIdEntities({ ...options, throwOnError: true });
    return data;
  },
  async createEntity(options: Options<PostApiV1WorksByWorkIdEntitiesData>) {
    const { data } = await postApiV1WorksByWorkIdEntities({ ...options, throwOnError: true });
    return data;
  },
  async updateEntity(options: Options<PatchApiV1WorksByWorkIdEntitiesByEntityIdData>) {
    const { data } = await patchApiV1WorksByWorkIdEntitiesByEntityId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async deleteEntity(options: Options<DeleteApiV1WorksByWorkIdEntitiesByEntityIdData>) {
    const { data } = await deleteApiV1WorksByWorkIdEntitiesByEntityId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async sceneLinks(options: Options<GetApiV1WorksByWorkIdScenesBySceneIdLinksData>) {
    const { data } = await getApiV1WorksByWorkIdScenesBySceneIdLinks({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async createSceneLink(options: Options<PostApiV1WorksByWorkIdScenesBySceneIdLinksData>) {
    const { data } = await postApiV1WorksByWorkIdScenesBySceneIdLinks({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async deleteSceneLink(
    options: Options<DeleteApiV1WorksByWorkIdScenesBySceneIdLinksByEntityIdData>
  ) {
    const { data } = await deleteApiV1WorksByWorkIdScenesBySceneIdLinksByEntityId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async timelineStates(
    options: Options<GetApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesData>
  ) {
    const { data } = await getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStates({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async createTimelineState(
    options: Options<PostApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesData>
  ) {
    const { data } = await postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStates({
      ...options,
      throwOnError: true,
    });
    return data;
  },
};

export const worldBibleQueries = {
  entities: getApiV1WorksByWorkIdEntitiesOptions,
  sceneLinks: getApiV1WorksByWorkIdScenesBySceneIdLinksOptions,
  timelineStates: getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesOptions,
};

export const worldBibleMutations = {
  createEntity: postApiV1WorksByWorkIdEntitiesMutation,
  updateEntity: patchApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  deleteEntity: deleteApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  createSceneLink: postApiV1WorksByWorkIdScenesBySceneIdLinksMutation,
  deleteSceneLink: deleteApiV1WorksByWorkIdScenesBySceneIdLinksByEntityIdMutation,
  createTimelineState: postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesMutation,
};
