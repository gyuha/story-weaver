import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useWorkspaceMeta } from '@/features/shared/store/selectors';
import { type Theme, useTheme } from '@/hooks/use-theme';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, LogOut, Monitor, Moon, Settings2, Sun } from 'lucide-react';

/** 상단 바 우측 인증 영역 — 비로그인: 로그인/회원가입, 로그인: 사용자 드롭다운(설정·테마·로그아웃) */
export function UserMenu() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { workspaceName, authorInitial } = useWorkspaceMeta();
  const { theme, setTheme, isDark } = useTheme();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2.5">
        <Link to="/auth/login" className="text-sm font-medium text-ink-soft hover:text-ink">
          로그인
        </Link>
        <Button render={<Link to="/auth/signup" />} className="h-8 px-3.5">
          회원가입
        </Button>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate({ to: '/' });
  };

  const ThemeIcon = theme === 'system' ? Monitor : isDark ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-[7px] py-1 pr-1.5 pl-1 transition-colors hover:bg-ink/[0.04] data-popup-open:bg-ink/[0.06]">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink font-serif text-[12px] font-bold text-white">
          {authorInitial}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-ink sm:block">
          {workspaceName}
        </span>
        <ChevronDown className="size-4 text-faint" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
          <span className="text-sm font-semibold text-ink">{workspaceName}</span>
          <span className="text-xs font-normal text-faint">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/settings" />}>
          <Settings2 />
          설정
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon />
            테마
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <DropdownMenuRadioItem value="light">
                <Sun />
                라이트 모드
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon />
                다크 모드
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor />
                시스템 설정
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout}>
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
