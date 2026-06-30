import { authApi } from '@/features/auth/api/auth.api';
import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Link, useNavigate } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { OrDivider, SocialRow } from './auth-form-parts';
import { AuthLayout } from './auth-layout';

// 백엔드는 잘못된 자격증명과 이메일 미인증을 둘 다 401로 주지만 detail이 다르다.
// 알려진 사유는 사용자가 이해할 친절한 한국어로 매핑하고, 그 외 detail은
// apiErrorMessage가 백엔드 문구를 그대로 노출한다(없으면 일반 문구).
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  'Invalid email or password.': '이메일 또는 비밀번호를 확인해주세요.',
  'Email verification is required before login.':
    '이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해 주세요.',
};

export function LoginPage({ redirect }: { redirect?: string }) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    try {
      const tokens = await authApi.login({ body: { email: email.trim(), password } });
      setSession(tokens);
      const user = await authApi.me();
      setUser(user);
      navigate({ to: redirect ?? '/works' });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      const mapped = typeof detail === 'string' ? LOGIN_ERROR_MESSAGES[detail] : undefined;
      setError(
        mapped ?? apiErrorMessage(err, '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      heading={
        <>
          기억하는 AI와
          <br />
          함께 쓰는 웹소설.
        </>
      }
      description="설정도, 복선도, 캐릭터의 어제도 — 작품의 모든 것을 AI가 기억한 채로 곁에서 함께 씁니다."
      footer="전체이용가 · 작가 원고는 모델 학습에 사용하지 않습니다"
      aside={
        <div className="max-w-[360px] rounded-[10px] border border-white/[0.12] bg-white/[0.05] p-[18px_20px]">
          <p className="mb-2.5 font-serif text-[15px] italic leading-[1.7] text-[#e9e9e7]">
            「혈산문의 칼끝은 내가 가장 잘 안다. 너는 약왕곡으로 돌아가 있어라.」
          </p>
          <div className="text-[12px] text-[#8a8985]">검을 거꾸로 쥔 회귀자 · 7화</div>
        </div>
      }
    >
      <div className="absolute top-[30px] right-[34px] text-[13px] text-muted-ink">
        계정이 없으신가요?{' '}
        <Link to="/auth/signup" className="font-medium text-primary">
          회원 가입
        </Link>
      </div>

      <form onSubmit={submit} className="w-[360px]">
        <h1 className="mb-2 text-[26px] font-bold leading-[1.25] tracking-[-0.02em]">
          다시 오신 걸 환영해요
        </h1>
        <div className="mb-[30px] text-sm leading-[1.5] text-muted-ink">
          이어서 집필을 시작하세요.
        </div>

        <SocialRow />
        <OrDivider />

        <label className="mb-4 block">
          <span className="mb-[7px] block text-[12.5px] font-medium text-ink-soft">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-line-strong px-[13px] text-sm text-ink focus:border-primary focus:shadow-[0_0_0_3px_rgba(35,131,226,0.22)] focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-[7px] flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ink-soft">비밀번호</span>
            <span className="text-[12px] text-primary">비밀번호를 잊으셨나요?</span>
          </span>
          <div className="flex h-11 items-center gap-2 rounded-md border border-line-strong px-[13px] focus-within:border-primary">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-base text-ink focus:outline-none"
            />
            <Eye className="size-[17px] text-faint" strokeWidth={2} />
          </div>
        </label>

        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-md bg-primary text-[14.5px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </AuthLayout>
  );
}
