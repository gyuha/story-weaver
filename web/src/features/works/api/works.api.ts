// works 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query/mutation option은 도메인 이름으로 다시 노출한다.
import {
  type DeleteApiV1WorksByWorkIdData,
  type GetApiV1WorksByWorkIdData,
  type GetApiV1WorksData,
  type Options,
  type PatchApiV1WorksByWorkIdData,
  type PostApiV1WorksData,
  deleteApiV1WorksByWorkId,
  getApiV1Works,
  getApiV1WorksByWorkId,
  patchApiV1WorksByWorkId,
  postApiV1Works,
} from '@/api';
import {
  deleteApiV1WorksByWorkIdMutation,
  getApiV1WorksByWorkIdOptions,
  getApiV1WorksOptions,
  patchApiV1WorksByWorkIdMutation,
  postApiV1WorksMutation,
} from '@/api/@tanstack/react-query.gen';

export const worksApi = {
  async list(options?: Options<GetApiV1WorksData>) {
    const { data } = await getApiV1Works({ ...options, throwOnError: true });
    return data;
  },
  async create(options: Options<PostApiV1WorksData>) {
    const { data } = await postApiV1Works({ ...options, throwOnError: true });
    return data;
  },
  async detail(options: Options<GetApiV1WorksByWorkIdData>) {
    const { data } = await getApiV1WorksByWorkId({ ...options, throwOnError: true });
    return data;
  },
  async update(options: Options<PatchApiV1WorksByWorkIdData>) {
    const { data } = await patchApiV1WorksByWorkId({ ...options, throwOnError: true });
    return data;
  },
  async remove(options: Options<DeleteApiV1WorksByWorkIdData>) {
    const { data } = await deleteApiV1WorksByWorkId({ ...options, throwOnError: true });
    return data;
  },
};

export const worksQueries = {
  list: getApiV1WorksOptions,
  detail: getApiV1WorksByWorkIdOptions,
};

export const worksMutations = {
  create: postApiV1WorksMutation,
  update: patchApiV1WorksByWorkIdMutation,
  remove: deleteApiV1WorksByWorkIdMutation,
};
