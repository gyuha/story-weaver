import { Button } from '@/components/ui/button';
import { type Theme, useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { Monitor, Moon, Sun } from 'lucide-react';

const order: Theme[] = ['light', 'dark', 'system'];
const labelMap: Record<Theme, string> = {
  light: '라이트 모드',
  dark: '다크 모드',
  system: '시스템 설정 따라가기',
};

function nextTheme(current: Theme): Theme {
  const i = order.indexOf(current);
  return order[(i + 1) % order.length] ?? 'system';
}

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme, isDark } = useTheme();

  const Icon = theme === 'system' ? Monitor : isDark ? Moon : Sun;
  const next = nextTheme(theme);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`테마 전환: 현재 ${labelMap[theme]} → 다음 ${labelMap[next]}`}
      title={labelMap[theme]}
      className={cn('size-9', className)}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}
