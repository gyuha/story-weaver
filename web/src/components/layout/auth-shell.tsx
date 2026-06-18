import type { ReactNode } from 'react';

interface AuthShellProps {
  children: ReactNode;
  title: string;
  subtitle: ReactNode;
}

export function AuthShell({ children, title, subtitle }: AuthShellProps) {
  return (
    <div className="flex min-h-screen">
      {/* 왼쪽: 브랜드 패널 (lg 이상에서만 표시) */}
      <div className="hidden lg:flex lg:w-[42%] bg-gradient-to-br from-blue-800 to-blue-500 flex-col justify-between p-10 text-white">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
              S
            </div>
            <span className="font-semibold text-base">StoryWeaver</span>
          </div>
          <h1 className="text-2xl font-bold leading-relaxed mb-3">
            AI와 함께 쓰는
            <br />
            웹소설 창작 플랫폼
          </h1>
          <p className="text-sm opacity-80 leading-relaxed">
            세계관·캐릭터·설정을 기억하는 AI
            <br />
            집필 코파일럿
          </p>
        </div>
        <div className="text-xs opacity-50">shadcn/ui · Zustand · TanStack Query</div>
      </div>

      {/* 오른쪽: 폼 영역 */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{title}</h2>
          <p className="text-sm text-gray-500 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
