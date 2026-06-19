import { LogoMark } from '@/components/layout/logo-mark';
import { UserMenu } from '@/components/layout/user-menu';
import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 전역 상단 바 — 좌측 브랜드(홈 링크) · 가운데 슬롯(children) · 검색 · 우측 사용자 영역.
 * 랜딩·작품 목록·작품 내부 화면에서 공통으로 사용한다.
 */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-5 border-b border-line bg-paper/90 px-5 backdrop-blur">
      <Link to="/works" className="flex items-center transition-opacity hover:opacity-80">
        <LogoMark size={22} withWordmark />
      </Link>
      {children}
      <div className="flex-1" />
      <div className="hidden h-8 w-56 items-center gap-2 rounded-[7px] border border-line px-3 text-faint lg:flex">
        <Search className="size-[15px]" strokeWidth={2} />
        <span className="text-[13px]">작품·작가 검색</span>
      </div>
      <UserMenu />
    </header>
  );
}
