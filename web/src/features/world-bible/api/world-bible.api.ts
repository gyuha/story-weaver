// world-bible(엔티티 카드·화-엔티티 링크·타임라인 상태) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query/mutation option은 도메인 이름으로 다시 노출한다.
import {
  type DeleteApiV1WorksByWorkIdChaptersByChapterIdLinksByEntityIdData,
  type DeleteApiV1WorksByWorkIdEntitiesByEntityIdData,
  type GetApiV1WorksByWorkIdChaptersByChapterIdLinksData,
  type GetApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesData,
  type GetApiV1WorksByWorkIdEntitiesData,
  type Options,
  type PatchApiV1WorksByWorkIdEntitiesByEntityIdData,
  type PostApiV1WorksByWorkIdChaptersByChapterIdLinksData,
  type PostApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesData,
  type PostApiV1WorksByWorkIdEntitiesData,
  deleteApiV1WorksByWorkIdChaptersByChapterIdLinksByEntityId,
  deleteApiV1WorksByWorkIdEntitiesByEntityId,
  getApiV1WorksByWorkIdChaptersByChapterIdLinks,
  getApiV1WorksByWorkIdEntities,
  getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStates,
  patchApiV1WorksByWorkIdEntitiesByEntityId,
  postApiV1WorksByWorkIdChaptersByChapterIdLinks,
  postApiV1WorksByWorkIdEntities,
  postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStates,
} from '@/api';
import {
  deleteApiV1WorksByWorkIdChaptersByChapterIdLinksByEntityIdMutation,
  deleteApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  getApiV1WorksByWorkIdChaptersByChapterIdLinksOptions,
  getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesOptions,
  getApiV1WorksByWorkIdEntitiesOptions,
  patchApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  postApiV1WorksByWorkIdChaptersByChapterIdLinksMutation,
  postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesMutation,
  postApiV1WorksByWorkIdEntitiesMutation,
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
  async chapterLinks(options: Options<GetApiV1WorksByWorkIdChaptersByChapterIdLinksData>) {
    const { data } = await getApiV1WorksByWorkIdChaptersByChapterIdLinks({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async createChapterLink(options: Options<PostApiV1WorksByWorkIdChaptersByChapterIdLinksData>) {
    const { data } = await postApiV1WorksByWorkIdChaptersByChapterIdLinks({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async deleteChapterLink(
    options: Options<DeleteApiV1WorksByWorkIdChaptersByChapterIdLinksByEntityIdData>
  ) {
    const { data } = await deleteApiV1WorksByWorkIdChaptersByChapterIdLinksByEntityId({
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
  chapterLinks: getApiV1WorksByWorkIdChaptersByChapterIdLinksOptions,
  timelineStates: getApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesOptions,
};

export const worldBibleMutations = {
  createEntity: postApiV1WorksByWorkIdEntitiesMutation,
  updateEntity: patchApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  deleteEntity: deleteApiV1WorksByWorkIdEntitiesByEntityIdMutation,
  createChapterLink: postApiV1WorksByWorkIdChaptersByChapterIdLinksMutation,
  deleteChapterLink: deleteApiV1WorksByWorkIdChaptersByChapterIdLinksByEntityIdMutation,
  createTimelineState: postApiV1WorksByWorkIdEntitiesByEntityIdTimelineStatesMutation,
};
