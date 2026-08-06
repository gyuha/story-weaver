import { manuscriptQueries } from '@/features/editor/api/manuscript.api';
import { toParagraphs } from '@/features/editor/lib/hydrate-chapters';
import { formatClockTime } from '@/features/editor/lib/version-time';
import type { Chapter } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { diffWords } from '../lib/word-diff';
import { VersionGroups } from './version-list';

const PAGE_SIZE = 30;
// eco: 서버가 항상 offset 0부터 limit개 전체를 최신순으로 주므로, limit을 늘려 다시
// 받는 것만으로 "더 보기"가 중복 없이 누적된다(수동 병합 코드 불필요). API 상한(limit<=100,
// plan.md #72)에 걸리면 더 못 늘어난다 — 화 하나가 버전 100개를 넘기면 진짜 offset
// 페이지네이션(누적 상태 관리)으로 바꿔야 한다.
const MAX_LIMIT = 100;

interface Props {
  workId: string;
  chapter: Chapter;
  /** 현재 화 본문(비교 기준) — 에디터의 실시간 텍스트 */
  currentText: string;
  /** 되돌리기 진행 중 — 버튼 재진입(더블클릭 등) 방지(리뷰 medium) */
  restoring: boolean;
  onRestore: (version: { id: string; body: string }) => void;
  onClose: () => void;
}

/** 버전 기록 모달 — 날짜 그룹·상대 시각 목록(C안) · 이 버전으로 되돌리기 · 인라인 단어 diff */
export function VersionHistoryModal({
  workId,
  chapter,
  currentText,
  restoring,
  onRestore,
  onClose,
}: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const chapterPath = { work_id: workId, episode_id: chapter.episodeId, chapter_id: chapter.id };

  const versionsQuery = useQuery(
    manuscriptQueries.chapterVersions({ path: chapterPath, query: { limit, offset: 0 } })
  );
  const items = versionsQuery.data?.items ?? [];
  const total = versionsQuery.data?.total ?? 0;
  const latestId = items[0]?.id ?? null;
  const remaining = total - items.length;

  // 목록이 처음 로드되면 최신 버전을 기본 선택한다.
  useEffect(() => {
    if (selectedId === null && latestId !== null) setSelectedId(latestId);
  }, [selectedId, latestId]);

  // 최신 버전 본문 — 미저장 여부 판정에 쓴다. 기본 선택이 최신 항목이라 대개
  // selectedQuery와 쿼리 키가 겹쳐 실제 요청은 한 번만 나간다(React Query dedupe, eco).
  const latestQuery = useQuery({
    ...manuscriptQueries.chapterVersion({ path: { ...chapterPath, version_id: latestId ?? '' } }),
    enabled: latestId !== null,
  });
  const selectedQuery = useQuery({
    ...manuscriptQueries.chapterVersion({
      path: { ...chapterPath, version_id: selectedId ?? '' },
    }),
    enabled: selectedId !== null,
  });

  const isUnsaved = latestQuery.data ? currentText !== latestQuery.data.body : false;
  const showUnsavedRow = items.length > 0 && isUnsaved;
  const selected = selectedQuery.data;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative flex h-[80vh] w-[760px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <span className="flex-1 text-sm font-semibold text-ink">버전 기록 · {chapter.title}</span>
          <button
            type="button"
            onClick={() => setShowDiff((d) => !d)}
            disabled={!selected}
            className={cn(
              'h-8 rounded-md px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-30',
              showDiff ? 'bg-primary/10 text-primary' : 'text-ink-soft hover:bg-surface'
            )}
          >
            diff 보기
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-8 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink-soft"
          >
            <X className="size-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 좌: 버전 목록 (최신순, 날짜 그룹) */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-line bg-surface-soft p-2">
            {versionsQuery.isPending ? (
              <div className="px-2.5 py-2 text-[12px] text-faint">불러오는 중…</div>
            ) : versionsQuery.isError ? (
              <div className="px-2.5 py-2 text-[12px] text-danger">
                버전 기록을 불러오지 못했습니다.
              </div>
            ) : items.length === 0 ? (
              <div className="px-2.5 py-2 text-[12px] text-faint">기록 없음</div>
            ) : (
              <>
                {showUnsavedRow && (
                  <div className="mb-2 rounded-md border border-dashed border-[#fcd34d] bg-[#fffbeb] px-2.5 py-2 text-[12.5px] font-medium text-[#92400e]">
                    편집 중 · 미저장
                  </div>
                )}
                <VersionGroups
                  items={items}
                  latestId={latestId}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}
                    disabled={limit >= MAX_LIMIT}
                    className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-center text-[10.5px] text-ink-soft transition-colors hover:bg-surface disabled:opacity-40"
                  >
                    더 보기 ({remaining}개 남음)
                  </button>
                )}
              </>
            )}
          </div>

          {/* 우: 선택 버전 본문 / diff */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-5 font-serif text-[15px] leading-[1.9] text-ink">
              {items.length === 0 ? (
                <div className="text-[13px] text-faint">왼쪽에서 이전 버전을 선택하세요.</div>
              ) : selectedQuery.isError ? (
                <div className="text-[13px] text-danger">버전을 불러오지 못했습니다.</div>
              ) : !selected ? (
                <div className="text-[13px] text-faint">불러오는 중…</div>
              ) : showDiff ? (
                <DiffView oldText={selected.body} newText={currentText} />
              ) : (
                toParagraphs(selected.body).map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 읽기 전용 스냅샷 문단
                  <p key={i} className="mb-3">
                    {p.text}
                  </p>
                ))
              )}
            </div>
            {selected && (
              <div className="flex h-14 shrink-0 items-center justify-between border-t border-line px-6">
                <span className="text-[12px] text-faint">
                  {showDiff
                    ? '선택 버전 → 현재 변경분'
                    : `${formatClockTime(selected.createdAt)} 버전 (읽기 전용)`}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-faint">현재 본문은 새 버전으로 보존됩니다</span>
                  <button
                    type="button"
                    onClick={() => onRestore({ id: selected.id, body: selected.body })}
                    disabled={restoring}
                    className="h-9 rounded-md bg-primary px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
                  >
                    이 버전으로 되돌리기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const ops = diffWords(oldText, newText);
  return (
    <p className="leading-[2]">
      {ops.map((op, i) => {
        if (op.type === 'equal')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff 토큰열
            <span key={i}>{op.text} </span>
          );
        if (op.type === 'added')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff 토큰열
            <span key={i} className="rounded bg-success/15 text-success underline">
              {op.text}{' '}
            </span>
          );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff 토큰열
          <span key={i} className="rounded bg-[#fdebec] text-[#c4554d] line-through">
            {op.text}{' '}
          </span>
        );
      })}
    </p>
  );
}
