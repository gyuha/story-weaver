// auth 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// 직접 호출 함수는 throwOnError: true로 성공 데이터만 반환하고,
// Query/mutation option은 도메인 이름으로 다시 노출한다.
import {
  type GetApiV1AuthMeData,
  type GetApiV1AuthOauthByProviderCallbackData,
  type GetApiV1AuthOauthByProviderLoginData,
  type Options,
  type PostApiV1AuthChangePasswordData,
  type PostApiV1AuthLoginData,
  type PostApiV1AuthLogoutData,
  type PostApiV1AuthPasswordResetConfirmData,
  type PostApiV1AuthPasswordResetData,
  type PostApiV1AuthRefreshData,
  type PostApiV1AuthSignupData,
  type PostApiV1AuthVerifyEmailByTokenData,
  getApiV1AuthMe,
  getApiV1AuthOauthByProviderCallback,
  getApiV1AuthOauthByProviderLogin,
  postApiV1AuthChangePassword,
  postApiV1AuthLogin,
  postApiV1AuthLogout,
  postApiV1AuthPasswordReset,
  postApiV1AuthPasswordResetConfirm,
  postApiV1AuthRefresh,
  postApiV1AuthSignup,
  postApiV1AuthVerifyEmailByToken,
} from '@/api';
import {
  getApiV1AuthMeOptions,
  getApiV1AuthOauthByProviderCallbackOptions,
  getApiV1AuthOauthByProviderLoginOptions,
  postApiV1AuthChangePasswordMutation,
  postApiV1AuthLoginMutation,
  postApiV1AuthLogoutMutation,
  postApiV1AuthPasswordResetConfirmMutation,
  postApiV1AuthPasswordResetMutation,
  postApiV1AuthRefreshMutation,
  postApiV1AuthSignupMutation,
  postApiV1AuthVerifyEmailByTokenMutation,
} from '@/api/@tanstack/react-query.gen';

export const authApi = {
  async signup(options: Options<PostApiV1AuthSignupData>) {
    const { data } = await postApiV1AuthSignup({ ...options, throwOnError: true });
    return data;
  },
  async verifyEmail(options: Options<PostApiV1AuthVerifyEmailByTokenData>) {
    const { data } = await postApiV1AuthVerifyEmailByToken({ ...options, throwOnError: true });
    return data;
  },
  async login(options: Options<PostApiV1AuthLoginData>) {
    const { data } = await postApiV1AuthLogin({ ...options, throwOnError: true });
    return data;
  },
  async refresh(options: Options<PostApiV1AuthRefreshData>) {
    const { data } = await postApiV1AuthRefresh({ ...options, throwOnError: true });
    return data;
  },
  async logout(options: Options<PostApiV1AuthLogoutData>) {
    const { data } = await postApiV1AuthLogout({ ...options, throwOnError: true });
    return data;
  },
  async me(options?: Options<GetApiV1AuthMeData>) {
    const { data } = await getApiV1AuthMe({ ...options, throwOnError: true });
    return data;
  },
  async passwordReset(options: Options<PostApiV1AuthPasswordResetData>) {
    const { data } = await postApiV1AuthPasswordReset({ ...options, throwOnError: true });
    return data;
  },
  async passwordResetConfirm(options: Options<PostApiV1AuthPasswordResetConfirmData>) {
    const { data } = await postApiV1AuthPasswordResetConfirm({ ...options, throwOnError: true });
    return data;
  },
  async changePassword(options: Options<PostApiV1AuthChangePasswordData>) {
    const { data } = await postApiV1AuthChangePassword({ ...options, throwOnError: true });
    return data;
  },
  async oauthLogin(options: Options<GetApiV1AuthOauthByProviderLoginData>) {
    const { data } = await getApiV1AuthOauthByProviderLogin({ ...options, throwOnError: true });
    return data;
  },
  async oauthCallback(options: Options<GetApiV1AuthOauthByProviderCallbackData>) {
    const { data } = await getApiV1AuthOauthByProviderCallback({ ...options, throwOnError: true });
    return data;
  },
};

export const authQueries = {
  me: getApiV1AuthMeOptions,
  oauthLogin: getApiV1AuthOauthByProviderLoginOptions,
  oauthCallback: getApiV1AuthOauthByProviderCallbackOptions,
};

export const authMutations = {
  signup: postApiV1AuthSignupMutation,
  verifyEmail: postApiV1AuthVerifyEmailByTokenMutation,
  login: postApiV1AuthLoginMutation,
  refresh: postApiV1AuthRefreshMutation,
  logout: postApiV1AuthLogoutMutation,
  passwordReset: postApiV1AuthPasswordResetMutation,
  passwordResetConfirm: postApiV1AuthPasswordResetConfirmMutation,
  changePassword: postApiV1AuthChangePasswordMutation,
};
