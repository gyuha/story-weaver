import type { ReactNode } from 'react';

/** 설정 화면 내 한 섹션(프로필·테마·비밀번호 등)의 공통 래퍼. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-ink/[0.07] py-7 first:border-t-0 first:pt-0">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-[1.5] text-faint">{description}</p>}
      </div>
      {children}
    </section>
  );
}
