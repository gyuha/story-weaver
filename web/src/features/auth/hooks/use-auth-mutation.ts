import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { mockLogin, mockSignup } from '../lib/mock-auth-api';
import { useAuthStore } from '../store/auth.store';
import type { LoginInput, SignupInput } from '../types/auth';

export function useLoginMutation() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (data: LoginInput) => mockLogin(data),
    onSuccess: (response) => {
      setAuth({ email: response.user.email, role: 'USER' }, '');
      navigate({ to: '/auth/login' });
    },
  });
}

export function useSignupMutation() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: SignupInput) => mockSignup(data),
    onSuccess: () => {
      toast.success('가입이 완료되었습니다!');
      navigate({ to: '/auth/login' });
    },
  });
}
