// world-bible(캐릭터 관계도) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환한다.
import {
  type GetApiV1WorksByWorkIdRelationshipsData,
  type Options,
  getApiV1WorksByWorkIdRelationships,
} from '@/api';

export const relationshipsApi = {
  async graph(options: Options<GetApiV1WorksByWorkIdRelationshipsData>) {
    const { data } = await getApiV1WorksByWorkIdRelationships({ ...options, throwOnError: true });
    return data;
  },
};
