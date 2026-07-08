// dynamic-update(씬 저장 후 신규 설정 추출·제안 승인/거절) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환한다.
import {
  type GetApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsData,
  type Options,
  type PostApiV1WorksByWorkIdScenesBySceneIdExtractUpdatesData,
  type PostApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdApproveData,
  type PostApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdRejectData,
  getApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestions,
  postApiV1WorksByWorkIdScenesBySceneIdExtractUpdates,
  postApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdApprove,
  postApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdReject,
} from '@/api';

export const suggestionApi = {
  async extract(options: Options<PostApiV1WorksByWorkIdScenesBySceneIdExtractUpdatesData>) {
    const { data } = await postApiV1WorksByWorkIdScenesBySceneIdExtractUpdates({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async list(options: Options<GetApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsData>) {
    const { data } = await getApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestions({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async approve(
    options: Options<PostApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdApproveData>
  ) {
    const { data } =
      await postApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdApprove({
        ...options,
        throwOnError: true,
      });
    return data;
  },
  async reject(
    options: Options<PostApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdRejectData>
  ) {
    const { data } =
      await postApiV1WorksByWorkIdScenesBySceneIdUpdateSuggestionsBySuggestionIdReject({
        ...options,
        throwOnError: true,
      });
    return data;
  },
};
