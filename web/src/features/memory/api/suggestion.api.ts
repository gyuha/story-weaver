// dynamic-update(화 저장 후 신규 설정 추출·제안 승인/거절) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환한다.
import {
  type GetApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsData,
  type Options,
  type PostApiV1WorksByWorkIdChaptersByChapterIdExtractUpdatesData,
  type PostApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdApproveData,
  type PostApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdRejectData,
  getApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestions,
  postApiV1WorksByWorkIdChaptersByChapterIdExtractUpdates,
  postApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdApprove,
  postApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdReject,
} from '@/api';

export const suggestionApi = {
  async extract(options: Options<PostApiV1WorksByWorkIdChaptersByChapterIdExtractUpdatesData>) {
    const { data } = await postApiV1WorksByWorkIdChaptersByChapterIdExtractUpdates({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async list(options: Options<GetApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsData>) {
    const { data } = await getApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestions({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async approve(
    options: Options<PostApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdApproveData>
  ) {
    const { data } =
      await postApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdApprove({
        ...options,
        throwOnError: true,
      });
    return data;
  },
  async reject(
    options: Options<PostApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdRejectData>
  ) {
    const { data } =
      await postApiV1WorksByWorkIdChaptersByChapterIdUpdateSuggestionsBySuggestionIdReject({
        ...options,
        throwOnError: true,
      });
    return data;
  },
};
