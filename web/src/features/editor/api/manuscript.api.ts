// editor(원고: 시놉시스·부·화) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query/mutation option은 도메인 이름으로 다시 노출한다.
import {
  type DeleteApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdData,
  type DeleteApiV1WorksByWorkIdEpisodesByEpisodeIdData,
  type GetApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsByVersionIdData,
  type GetApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsData,
  type GetApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersData,
  type GetApiV1WorksByWorkIdEpisodesData,
  type GetApiV1WorksByWorkIdSynopsisData,
  type Options,
  type PatchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdData,
  type PatchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersReorderData,
  type PatchApiV1WorksByWorkIdEpisodesByEpisodeIdData,
  type PatchApiV1WorksByWorkIdEpisodesReorderData,
  type PostApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersData,
  type PostApiV1WorksByWorkIdEpisodesData,
  type PutApiV1WorksByWorkIdSynopsisData,
  deleteApiV1WorksByWorkIdEpisodesByEpisodeId,
  deleteApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterId,
  getApiV1WorksByWorkIdEpisodes,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChapters,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersions,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsByVersionId,
  getApiV1WorksByWorkIdSynopsis,
  patchApiV1WorksByWorkIdEpisodesByEpisodeId,
  patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterId,
  patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersReorder,
  patchApiV1WorksByWorkIdEpisodesReorder,
  postApiV1WorksByWorkIdEpisodes,
  postApiV1WorksByWorkIdEpisodesByEpisodeIdChapters,
  putApiV1WorksByWorkIdSynopsis,
} from '@/api';
import {
  deleteApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdMutation,
  deleteApiV1WorksByWorkIdEpisodesByEpisodeIdMutation,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsByVersionIdOptions,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsOptions,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsQueryKey,
  getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersOptions,
  getApiV1WorksByWorkIdEpisodesOptions,
  getApiV1WorksByWorkIdSynopsisOptions,
  patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdMutation,
  patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersReorderMutation,
  patchApiV1WorksByWorkIdEpisodesByEpisodeIdMutation,
  patchApiV1WorksByWorkIdEpisodesReorderMutation,
  postApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersMutation,
  postApiV1WorksByWorkIdEpisodesMutation,
  putApiV1WorksByWorkIdSynopsisMutation,
} from '@/api/@tanstack/react-query.gen';

export const manuscriptApi = {
  async synopsis(options: Options<GetApiV1WorksByWorkIdSynopsisData>) {
    const { data } = await getApiV1WorksByWorkIdSynopsis({ ...options, throwOnError: true });
    return data;
  },
  async updateSynopsis(options: Options<PutApiV1WorksByWorkIdSynopsisData>) {
    const { data } = await putApiV1WorksByWorkIdSynopsis({ ...options, throwOnError: true });
    return data;
  },
  async episodes(options: Options<GetApiV1WorksByWorkIdEpisodesData>) {
    const { data } = await getApiV1WorksByWorkIdEpisodes({ ...options, throwOnError: true });
    return data;
  },
  async createEpisode(options: Options<PostApiV1WorksByWorkIdEpisodesData>) {
    const { data } = await postApiV1WorksByWorkIdEpisodes({ ...options, throwOnError: true });
    return data;
  },
  async updateEpisode(options: Options<PatchApiV1WorksByWorkIdEpisodesByEpisodeIdData>) {
    const { data } = await patchApiV1WorksByWorkIdEpisodesByEpisodeId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async deleteEpisode(options: Options<DeleteApiV1WorksByWorkIdEpisodesByEpisodeIdData>) {
    const { data } = await deleteApiV1WorksByWorkIdEpisodesByEpisodeId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async reorderEpisodes(options: Options<PatchApiV1WorksByWorkIdEpisodesReorderData>) {
    const { data } = await patchApiV1WorksByWorkIdEpisodesReorder({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async chapters(options: Options<GetApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersData>) {
    const { data } = await getApiV1WorksByWorkIdEpisodesByEpisodeIdChapters({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async createChapter(options: Options<PostApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersData>) {
    const { data } = await postApiV1WorksByWorkIdEpisodesByEpisodeIdChapters({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async updateChapter(
    options: Options<PatchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdData>
  ) {
    const { data } = await patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async deleteChapter(
    options: Options<DeleteApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdData>
  ) {
    const { data } = await deleteApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterId({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async reorderChapters(
    options: Options<PatchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersReorderData>
  ) {
    const { data } = await patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersReorder({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async chapterVersions(
    options: Options<GetApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsData>
  ) {
    const { data } = await getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersions({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async chapterVersion(
    options: Options<GetApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsByVersionIdData>
  ) {
    const { data } =
      await getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsByVersionId({
        ...options,
        throwOnError: true,
      });
    return data;
  },
};

export const manuscriptQueries = {
  synopsis: getApiV1WorksByWorkIdSynopsisOptions,
  episodes: getApiV1WorksByWorkIdEpisodesOptions,
  chapters: getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersOptions,
  chapterVersions: getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsOptions,
  chapterVersion:
    getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsByVersionIdOptions,
  // 목록 캐시 무효화용 — query 없이 호출하면(limit/offset 생략) 부분 일치로 모든 페이지를 잡는다.
  chapterVersionsKey: getApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdVersionsQueryKey,
};

export const manuscriptMutations = {
  updateSynopsis: putApiV1WorksByWorkIdSynopsisMutation,
  createEpisode: postApiV1WorksByWorkIdEpisodesMutation,
  updateEpisode: patchApiV1WorksByWorkIdEpisodesByEpisodeIdMutation,
  deleteEpisode: deleteApiV1WorksByWorkIdEpisodesByEpisodeIdMutation,
  reorderEpisodes: patchApiV1WorksByWorkIdEpisodesReorderMutation,
  createChapter: postApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersMutation,
  updateChapter: patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdMutation,
  deleteChapter: deleteApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersByChapterIdMutation,
  reorderChapters: patchApiV1WorksByWorkIdEpisodesByEpisodeIdChaptersReorderMutation,
};
