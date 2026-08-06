import type { ChapterVersionListItem } from '@/api';
import {
  dateGroupLabel,
  formatCharDelta,
  formatClockTime,
  formatRelativeTime,
} from '@/features/editor/lib/version-time';
import { cn } from '@/lib/utils';

/** 최신순 항목을 날짜 그룹(오늘/어제/MM-DD)으로 묶어 헤더와 함께 렌더한다. */
export function VersionGroups({
  items,
  latestId,
  selectedId,
  onSelect,
  rightId,
  onSetRight,
}: {
  items: ChapterVersionListItem[];
  latestId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 버전 비교 페이지의 "우(비교)" 지점 — 모달은 넘기지 않아 배지·마커가 뜨지 않는다. */
  rightId?: string | null;
  onSetRight?: (id: string) => void;
}) {
  const now = new Date();
  const groups: { label: string; items: ChapterVersionListItem[] }[] = [];
  for (const item of items) {
    const label = dateGroupLabel(item.createdAt, now);
    const lastGroup = groups.at(-1);
    if (lastGroup?.label === label) lastGroup.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-2 py-1.5 text-[11.5px] font-semibold text-faint">{group.label}</div>
          {group.items.map((item) => (
            <VersionRow
              key={item.id}
              item={item}
              now={now}
              isLatest={item.id === latestId}
              selected={item.id === selectedId}
              isRight={item.id === rightId}
              onSelect={() => onSelect(item.id)}
              onSetRight={onSetRight && (() => onSetRight(item.id))}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function VersionRow({
  item,
  now,
  isLatest,
  selected,
  isRight,
  onSelect,
  onSetRight,
}: {
  item: ChapterVersionListItem;
  now: Date;
  isLatest: boolean;
  selected: boolean;
  isRight: boolean;
  onSelect: () => void;
  /** 있을 때만(페이지) "우로 지정" 마커와 좌 배지를 그린다 — 모달은 넘기지 않는다. */
  onSetRight?: () => void;
}) {
  return (
    <div className="group mb-1 flex gap-1">
      <button
        type="button"
        data-testid="version-item"
        onClick={onSelect}
        className={cn(
          'flex-1 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors',
          selected ? 'bg-surface font-medium text-ink' : 'text-ink-soft hover:bg-surface/60'
        )}
      >
        <span className="flex items-baseline gap-1.5">
          <span>{formatRelativeTime(item.createdAt, now)}</span>
          <span className="text-[9.5px] text-faint">{formatClockTime(item.createdAt)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {selected && onSetRight && (
              <span className="rounded-[3px] bg-danger px-1 text-[9px] font-semibold text-white">
                좌
              </span>
            )}
            {isRight && (
              <span className="rounded-[3px] bg-success px-1 text-[9px] font-semibold text-white">
                우
              </span>
            )}
            {isLatest && (
              <span className="rounded-[3px] bg-primary px-1 text-[9px] font-semibold text-white">
                최신
              </span>
            )}
          </span>
        </span>
        <span className="mt-0.5 block text-[10px] text-faint">
          {item.charCount.toLocaleString('ko-KR')}자
          {item.charDelta !== null && (
            <span className={item.charDelta >= 0 ? 'text-success' : 'text-danger'}>
              {' '}
              {formatCharDelta(item.charDelta)}
            </span>
          )}
        </span>
      </button>
      {onSetRight && (
        <button
          type="button"
          onClick={onSetRight}
          className="shrink-0 self-center whitespace-nowrap rounded-[4px] border border-line px-1.5 py-1 text-[9.5px] text-ink-soft opacity-0 transition-opacity hover:bg-surface hover:text-ink group-hover:opacity-100"
        >
          우로 지정
        </button>
      )}
    </div>
  );
}
