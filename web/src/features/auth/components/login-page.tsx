import { Link, useNavigate } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { OrDivider, SocialRow } from './auth-form-parts';
import { AuthLayout } from './auth-layout';

export function LoginPage({ redirect }: { redirect?: string }) {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('baekya@storyweaver.kr');
  const [password, setPassword] = useState('storyweaver');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    login({ email: email.trim(), role: 'USER' });
    navigate({ to: redirect ?? '/works' });
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

        <button
          type="submit"
          className="h-11 w-full rounded-md bg-primary text-[14.5px] font-semibold text-white transition-colors hover:bg-primary/90"
        >
          로그인
        </button>
      </form>
    </AuthLayout>
  );
}
