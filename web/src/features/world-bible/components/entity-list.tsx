import { entitiesByType } from '@/features/shared/store/selectors';
import type { Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';

export function EntityList({ work, selectedId }: { work: Work; selectedId?: string }) {
  const groups = entitiesByType(work.entities);

  return (
    <div className="flex w-[266px] shrink-0 flex-col border-r border-ink/[0.06] bg-paper">
      <div className="px-[18px] pt-[18px] pb-3.5">
        <div className="mb-[13px] text-[18px] font-bold leading-[1.2]">World Bible</div>
        <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface-soft px-[11px]">
          <Search className="size-[15px] text-faint" strokeWidth={2} />
          <span className="text-[13px] text-faintest">설정 검색</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {groups.map((group) => (
          <div key={group.type}>
            <div className="px-2.5 pt-3 pb-[5px] text-[11.5px] font-semibold text-faint">
              {group.type} · {group.items.length}
            </div>
            {group.items.map((entity) => {
              const active = entity.id === selectedId;
              return (
                <Link
                  key={entity.id}
                  to="/works/$workId/bible"
                  params={{ workId: work.id }}
                  search={{ entity: entity.id }}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-[5px] px-2.5 text-[13.5px] transition-colors',
                    active
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-ink hover:bg-ink/[0.04]'
                  )}
                >
                  {entity.imageUrl ? (
                    <img
                      src={entity.imageUrl}
                      alt=""
                      className="size-[18px] shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="text-[15px]">{entity.emoji}</span>
                  )}
                  <span className="flex-1 truncate">{entity.name}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="px-3.5 py-2.5">
        <Link
          to="/works/$workId/bible/new"
          params={{ workId: work.id }}
          className="flex h-[34px] w-full items-center justify-center gap-[7px] rounded-md border border-dashed border-line-strong text-[13px] font-medium text-muted-ink transition-colors hover:bg-surface"
        >
          <Plus className="size-[15px]" strokeWidth={2} />새 엔티티
        </Link>
      </div>
    </div>
  );
}
