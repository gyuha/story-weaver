// timeline(설정 충돌 감지) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환한다.
import {
  type GetApiV1WorksByWorkIdConflictsData,
  type Options,
  getApiV1WorksByWorkIdConflicts,
} from '@/api';

export const conflictsApi = {
  async list(options: Options<GetApiV1WorksByWorkIdConflictsData>) {
    const { data } = await getApiV1WorksByWorkIdConflicts({ ...options, throwOnError: true });
    return data;
  },
};
