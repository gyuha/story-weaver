import { useMutation } from '@tanstack/react-query'
import { postAuthLogin, postAuthLogout, postAuthSignup } from '@/api/sdk.gen'
import { useAuthStore } from '@/features/auth/store/auth.store'

export function useLogin() {
  const setTokens = useAuthStore((s) => s.setTokens)
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      postAuthLogin({ body }).then((r) => r.data),
    onSuccess: (data, variables) => {
      if (data?.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken ?? '', variables.email)
      }
    },
  })
}

export function useSignup() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      postAuthSignup({ body }).then((r) => r.data),
  })
}

export function useLogout() {
  const clearUser = useAuthStore((s) => s.clearUser)
  return useMutation({
    mutationFn: async () => {
      try { await postAuthLogout({}) } catch { /* ignore */ }
    },
    onSuccess: () => clearUser(),
  })
}
