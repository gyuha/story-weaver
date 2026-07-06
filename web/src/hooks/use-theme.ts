import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function resolveDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** localStorage에 테마를 저장하고 documentElement의 다크 클래스를 즉시 반영한다. */
export function applyTheme(theme: Theme): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.classList.toggle('dark', resolveDark(theme));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : resolveDark(readStoredTheme())
  );

  useEffect(() => {
    applyTheme(theme);
    setIsDark(resolveDark(theme));

    if (theme !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches);
      setIsDark(e.matches);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  return { theme, setTheme, toggle, isDark };
}
