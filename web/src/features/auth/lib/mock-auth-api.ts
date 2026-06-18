import type { AuthResponse, LoginInput, SignupInput } from '../types/auth';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function mockLogin(input: LoginInput): Promise<AuthResponse> {
  await delay(750);
  if (input.email === 'fail@example.com') {
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
  }
  return {
    user: {
      name: input.email.split('@')[0],
      email: input.email,
    },
  };
}

export async function mockSignup(input: SignupInput): Promise<AuthResponse> {
  await delay(750);
  if (input.email === 'taken@example.com') {
    throw new Error('이미 사용 중인 이메일입니다');
  }
  return {
    user: {
      name: input.name,
      email: input.email,
    },
  };
}
