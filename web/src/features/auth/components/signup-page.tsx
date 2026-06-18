import { Link, useNavigate } from '@tanstack/react-router';
import { Check, Eye } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { OrDivider, SocialRow } from './auth-form-parts';
import { AuthLayout } from './auth-layout';

const FEATURES = [
  '설정 충돌을 추적하는 타임라인 상태',
  '이어쓰기·인필링·문체 변환 집필 보조',
  '월 50만 토큰 무료 제공',
];

export function SignupPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [penName, setPenName] = useState('백야');
  const [email, setEmail] = useState('baekya@storyweaver.kr');
  const [password, setPassword] = useState('storyweaver');
  const [agreed, setAgreed] = useState(true);

  const strength = Math.min(3, Math.floor(password.length / 4));
  const canSubmit = penName.trim() && email.trim() && password.length >= 8 && agreed;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    login({ email: email.trim(), role: 'USER' });
    navigate({ to: '/works' });
  };

  return (
    <AuthLayout
      heading={
        <>
          첫 문장부터,
          <br />
          혼자가 아니게.
        </>
      }
      description="장르와 문체를 고르면 World Bible과 메모리가 함께 시작됩니다. 무료 플랜으로 바로 1화를 써 보세요."
      footer="작가 원고는 모델 학습에 사용하지 않습니다"
      aside={
        <div className="flex max-w-[360px] flex-col gap-3.5">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-[11px]">
              <Check className="size-4 shrink-0 text-[#9bbf9f]" strokeWidth={2.4} />
              <span className="text-[13.5px] leading-[1.5] text-[#e9e9e7]">{f}</span>
            </div>
          ))}
        </div>
      }
    >
      <div className="absolute top-[30px] right-[34px] text-[13px] text-muted-ink">
        이미 계정이 있으신가요?{' '}
        <Link to="/auth/login" className="font-medium text-primary">
          로그인
        </Link>
      </div>

      <form onSubmit={submit} className="w-[360px]">
        <h1 className="mb-2 text-[26px] font-bold leading-[1.25] tracking-[-0.02em]">
          웹소설 창작을 시작하세요
        </h1>
        <div className="mb-6 text-sm leading-[1.5] text-muted-ink">30초면 충분해요.</div>

        <SocialRow compact />
        <OrDivider />

        <Field label="필명" value={penName} onChange={setPenName} />
        <Field label="이메일" type="email" value={email} onChange={setEmail} />

        <label className="mb-[18px] block">
          <span className="mb-[7px] block text-[12.5px] font-medium text-ink-soft">비밀번호</span>
          <div className="flex h-11 items-center gap-2 rounded-md border border-line-strong px-[13px] focus-within:border-primary">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-base text-ink focus:outline-none"
            />
            <Eye className="size-[17px] text-faint" strokeWidth={2} />
          </div>
          <div className="mt-[9px] flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[3px] flex-1 rounded-sm"
                  style={{ background: i < strength ? '#448361' : '#ececeb' }}
                />
              ))}
            </div>
            <span className="text-[11.5px] text-muted-ink">
              {password.length >= 8 ? '안전 · 8자 이상' : '8자 이상 권장'}
            </span>
          </div>
        </label>

        <button
          type="button"
          onClick={() => setAgreed((v) => !v)}
          className="mb-5 flex w-full items-start gap-[9px] text-left"
        >
          <span
            className={`mt-px grid size-[18px] shrink-0 place-items-center rounded ${
              agreed ? 'bg-primary' : 'border border-line-strong'
            }`}
          >
            {agreed && <Check className="size-3 text-white" strokeWidth={3} />}
          </span>
          <span className="text-[12.5px] leading-[1.55] text-muted-ink">
            <span className="text-ink">이용약관</span>과{' '}
            <span className="text-ink">개인정보처리방침</span>에 동의합니다. 생성물의 저작권은
            작가에게 귀속됩니다.
          </span>
        </button>

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-md bg-primary text-[14.5px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          무료로 시작하기
        </button>
      </form>
    </AuthLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-[7px] block text-[12.5px] font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-line-strong px-[13px] text-sm text-ink focus:border-primary focus:shadow-[0_0_0_3px_rgba(35,131,226,0.22)] focus:outline-none"
      />
    </label>
  );
}
