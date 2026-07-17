// memory(화 메모리 검색: 링크 엔티티+타임라인 상태+벡터 매칭) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query option은 도메인 이름으로 다시 노출한다.
import {
  type GetApiV1WorksByWorkIdChaptersByChapterIdMemoryData,
  type Options,
  getApiV1WorksByWorkIdChaptersByChapterIdMemory,
} from '@/api';
import { getApiV1WorksByWorkIdChaptersByChapterIdMemoryOptions } from '@/api/@tanstack/react-query.gen';

export const memoryApi = {
  async search(options: Options<GetApiV1WorksByWorkIdChaptersByChapterIdMemoryData>) {
    const { data } = await getApiV1WorksByWorkIdChaptersByChapterIdMemory({
      ...options,
      throwOnError: true,
    });
    return data;
  },
};

export const memoryQueries = {
  search: getApiV1WorksByWorkIdChaptersByChapterIdMemoryOptions,
};
