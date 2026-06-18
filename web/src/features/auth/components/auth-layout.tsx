import { Lock, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  heading: ReactNode;
  description: string;
  aside: ReactNode;
  footer: string;
  children: ReactNode;
}

/** 인증 화면 분할 레이아웃 — 좌측 먹빛 브랜드 패널 + 우측 폼 */
export function AuthLayout({ heading, description, aside, footer, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-board">
      <div className="flex w-[520px] shrink-0 flex-col bg-ink p-[48px_52px] text-white max-lg:hidden">
        <div className="flex items-center gap-[11px]">
          <div className="grid size-8 place-items-center rounded-lg bg-white/[0.12]">
            <Pencil className="size-[18px]" strokeWidth={2} aria-hidden />
          </div>
          <span className="text-[19px] font-bold tracking-[-0.01em]">StoryWeaver</span>
        </div>

        <div className="flex flex-1 flex-col justify-center pb-5">
          <h2 className="mb-4 font-serif text-[33px] font-bold leading-[1.4] tracking-[-0.01em]">
            {heading}
          </h2>
          <p className="mb-[30px] max-w-[340px] text-[14.5px] leading-[1.7] text-faintest">
            {description}
          </p>
          {aside}
        </div>

        <div className="flex items-center gap-2 text-[12px] leading-[1.5] text-[#8a8985]">
          <Lock className="size-[13px] shrink-0" strokeWidth={2} />
          {footer}
        </div>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center bg-paper p-12">
        {children}
      </div>
    </div>
  );
}
