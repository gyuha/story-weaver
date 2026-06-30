// health 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query option은 도메인 이름으로 다시 노출한다. (mutation 없음)
import { type GetHealthData, type GetReadyData, type Options, getHealth, getReady } from '@/api';
import { getHealthOptions, getReadyOptions } from '@/api/@tanstack/react-query.gen';

export const healthApi = {
  async health(options?: Options<GetHealthData>) {
    const { data } = await getHealth({ ...options, throwOnError: true });
    return data;
  },
  async ready(options?: Options<GetReadyData>) {
    const { data } = await getReady({ ...options, throwOnError: true });
    return data;
  },
};

export const healthQueries = {
  health: getHealthOptions,
  ready: getReadyOptions,
};
