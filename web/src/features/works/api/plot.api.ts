// 비트 시트(v2-A Plot Architect) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// mutation option은 도메인 이름으로 다시 노출한다.
import {
  type Options,
  type PostApiV1WorksByWorkIdBeatSheetData,
  postApiV1WorksByWorkIdBeatSheet,
} from '@/api';
import { postApiV1WorksByWorkIdBeatSheetMutation } from '@/api/@tanstack/react-query.gen';

export const plotApi = {
  async generateBeatSheet(options: Options<PostApiV1WorksByWorkIdBeatSheetData>) {
    const { data } = await postApiV1WorksByWorkIdBeatSheet({ ...options, throwOnError: true });
    return data;
  },
};

export const plotMutations = {
  generateBeatSheet: postApiV1WorksByWorkIdBeatSheetMutation,
};
