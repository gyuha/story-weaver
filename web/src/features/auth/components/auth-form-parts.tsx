import { cn } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const PROVIDERS = [
  { key: 'google', short: 'Google', full: 'Google로 계속하기', badge: 'G' },
  { key: 'kakao', short: '카카오', full: '카카오로 계속하기', badge: null },
  { key: 'naver', short: '네이버', full: '네이버로 계속하기', badge: 'N' },
] as const;

export function SocialRow({ compact }: { compact?: boolean }) {
  return (
    <div className={cn('mb-5', compact ? 'flex gap-[9px]' : 'flex flex-col gap-[9px]')}>
      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => toast(`${p.short} 로그인 (목업)`)}
          className={cn(
            'flex h-11 items-center justify-center gap-2.5 rounded-md border border-line-strong font-medium text-ink transition-colors hover:bg-surface',
            compact ? 'flex-1 gap-2 text-[13.5px]' : 'text-sm'
          )}
        >
          {p.badge ? (
            <span className="grid size-[18px] place-items-center rounded bg-ink text-[11px] font-bold text-white">
              {p.badge}
            </span>
          ) : (
            <MessageSquare className="size-[17px] fill-ink text-ink" />
          )}
          {compact ? p.short : p.full}
        </button>
      ))}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-[#ececeb]" />
      <span className="text-[12px] text-faint">또는 이메일로</span>
      <span className="h-px flex-1 bg-[#ececeb]" />
    </div>
  );
}
