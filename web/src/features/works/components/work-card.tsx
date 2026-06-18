import type { Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

const THEME: Record<
  Work['coverTheme'],
  { cover: string; label: string; title: string; bar: string; track: string }
> = {
  dark: {
    cover: 'bg-ink',
    label: 'text-white/55',
    title: 'text-white',
    bar: 'bg-ink',
    track: 'bg-[#ececeb]',
  },
  green: {
    cover: 'bg-[#edf3ec]',
    label: 'text-[#548164]',
    title: 'text-ink',
    bar: 'bg-[#548164]',
    track: 'bg-[#ececeb]',
  },
  orange: {
    cover: 'bg-[#fbecdd]',
    label: 'text-[#cc782f]',
    title: 'text-ink',
    bar: 'bg-[#cc782f]',
    track: 'bg-[#ececeb]',
  },
};

export function WorkCard({ work }: { work: Work }) {
  const t = THEME[work.coverTheme];
  return (
    <Link
      to="/works/$workId/write"
      params={{ workId: work.id }}
      className={cn(
        'block overflow-hidden rounded-[10px] border border-line bg-paper transition-shadow hover:shadow-sm',
        work.status === '연재 중' && 'shadow-[0_1px_3px_rgba(15,15,15,0.05)]'
      )}
    >
      <div className={cn('relative flex h-32 flex-col justify-end p-[16px_18px]', t.cover)}>
        <span
          className={cn(
            'absolute top-[13px] left-[18px] text-[11px] font-semibold tracking-[0.05em]',
            t.label
          )}
        >
          {work.genre} · {work.subGenre}
        </span>
        {work.status === '연재 중' && (
          <div className="absolute top-[11px] right-3.5 rounded-full bg-white/[0.12] px-2.5 py-1 text-[11px] font-medium text-white/60">
            연재 중
          </div>
        )}
        <div
          className={cn(
            'font-serif text-[21px] font-bold leading-[1.32] tracking-[-0.01em]',
            t.title
          )}
        >
          {work.title}
        </div>
      </div>
      <div className="p-[14px_16px_16px]">
        <div className="mb-3 flex gap-3.5 whitespace-nowrap text-[12.5px] text-muted-ink">
          <span>
            <b className="font-semibold text-ink">{work.stats.chapters}</b>화
          </span>
          <span>
            <b className="font-semibold text-ink">{work.stats.words}</b>
            {work.stats.wordsUnit}
          </span>
          <span>등장인물 {work.stats.characters}</span>
        </div>
        <div className={cn('mb-2.5 h-1 overflow-hidden rounded-[3px]', t.track)}>
          <div className={cn('h-full', t.bar)} style={{ width: `${work.stats.progress}%` }} />
        </div>
        <div className="text-[12px] text-faint">{work.lastEditedLabel}</div>
      </div>
    </Link>
  );
}

export function NewWorkCard() {
  return (
    <Link
      to="/works/new"
      className="flex min-h-[224px] flex-col items-center justify-center gap-2.5 rounded-[10px] border-[1.5px] border-dashed border-line-strong bg-surface-soft transition-colors hover:border-faint"
    >
      <div className="grid size-10 place-items-center rounded-full border border-line bg-paper">
        <Plus className="size-5 text-muted-ink" strokeWidth={2} />
      </div>
      <span className="text-sm font-medium text-ink-soft">새 작품 만들기</span>
      <span className="max-w-[170px] text-center text-[12px] leading-[1.5] text-faint">
        장르와 문체를 고르고
        <br />
        World Bible을 시작하세요
      </span>
    </Link>
  );
}
