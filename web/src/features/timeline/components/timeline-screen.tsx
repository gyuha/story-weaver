import { WorkShell } from '@/components/layout/work-shell';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Conflict, ConflictChapterRef, Work } from '@/features/shared/types';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export function TimelineScreen({ work }: { work: Work }) {
  const dismissConflict = useWorksStore((s) => s.dismissConflict);
  const lastPart = work.chapters.at(-1)?.partLabel ?? '';
  const records = [...work.timeline].reverse();

  return (
    <WorkShell work={work} active="timeline">
      <div className="flex h-full flex-col">
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-ink/[0.06] px-10 text-[13.5px]">
          <span className="text-muted-ink">{work.title}</span>
          <ChevronRight className="size-3 text-line-strong" strokeWidth={2} />
          <span className="font-medium text-ink">검토</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="max-w-[840px] px-10 py-[34px]">
            <h1 className="mb-1.5 text-[28px] font-bold tracking-[-0.02em]">검토</h1>
            <div className="mb-[22px] text-sm text-muted-ink">
              타임라인 상태를 확인하고 저장하세요{lastPart && ` · ${lastPart}`}
            </div>

            <div className="mb-6 flex gap-3">
              <Stat value={work.reviewSummary.scenes} label="화" />
              <Stat value={work.reviewSummary.states} label="타임라인 상태 기록" />
              <Stat value={work.reviewSummary.conflicts} label="충돌 후보" danger />
            </div>

            {work.conflicts.map((conflict) => {
              const gotoLabel = conflict.later.chapterRef
                ? `${conflict.later.chapterRef}로 이동`
                : '해당 화로 이동';
              return (
                <ConflictCallout
                  key={conflict.id}
                  conflict={conflict}
                  gotoLabel={gotoLabel}
                  onGoto={() => toast(`${gotoLabel} (목업)`)}
                  onDismiss={() => {
                    dismissConflict(work.id, conflict.id);
                    toast.success('충돌 후보를 무시했습니다');
                  }}
                />
              );
            })}

            <div className="mt-6 mb-[11px] text-[13px] font-semibold text-muted-ink">
              최근 타임라인 상태 기록
            </div>
            <div className="overflow-hidden rounded-[9px] border border-line">
              <div className="flex items-center border-b border-line bg-surface-soft px-4 py-[9px] text-[11.5px] font-semibold text-faint">
                <span className="w-24">엔티티</span>
                <span className="w-[88px]">시점</span>
                <span className="flex-1">상태</span>
                <span className="w-[70px] text-right">출처</span>
              </div>
              {records.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center border-b border-[#f1f1ef] px-4 py-[11px] text-[13px] last:border-b-0"
                >
                  <span className="w-24 text-ink">{r.entityName}</span>
                  <span className="w-[88px] text-muted-ink">{r.chapterRef}</span>
                  <span className="flex-1 text-ink">
                    <span className="font-mono text-[12px] text-faint">{r.key}</span> ={' '}
                    {r.value === 'dead' ? (
                      <b className="font-semibold text-[#c4554d]">dead</b>
                    ) : (
                      r.value
                    )}
                  </span>
                  <span className="w-[70px] text-right">
                    {r.source === 'ai' ? (
                      <span className="rounded bg-ai/[0.12] px-1.5 py-[3px] text-[10.5px] font-medium text-ai">
                        AI 제안
                      </span>
                    ) : (
                      <span className="rounded bg-[#f1f1ef] px-1.5 py-[3px] text-[10.5px] font-medium text-muted-ink">
                        작가
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WorkShell>
  );
}

function Stat({ value, label, danger }: { value: number; label: string; danger?: boolean }) {
  return (
    <div
      className={
        danger && value > 0
          ? 'flex-1 rounded-[9px] border border-[#f0c9c6] bg-[#fdebec] p-[14px_16px]'
          : 'flex-1 rounded-[9px] border border-line p-[14px_16px]'
      }
    >
      <div
        className={
          danger && value > 0
            ? 'mb-1.5 text-2xl font-bold text-[#c4554d]'
            : 'mb-1.5 text-2xl font-bold text-ink'
        }
      >
        {value}
      </div>
      <div
        className={
          danger && value > 0 ? 'text-[12.5px] text-[#c4554d]' : 'text-[12.5px] text-muted-ink'
        }
      >
        {label}
      </div>
    </div>
  );
}

function ConflictCallout({
  conflict,
  gotoLabel,
  onGoto,
  onDismiss,
}: {
  conflict: Conflict;
  gotoLabel: string;
  onGoto: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-3.5 rounded-[10px] bg-[#fdebec] p-[18px_20px]">
      <div className="flex items-start gap-[13px]">
        <span className="text-[19px] leading-[1.3]">⚠️</span>
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-[9px]">
            <span className="text-[15px] font-bold text-ink">설정 충돌 후보</span>
            <span className="rounded bg-ai/[0.12] px-[7px] py-1 text-[10.5px] font-medium text-ai">
              v2 자동 감지 미리보기
            </span>
          </div>
          <div className="mb-4 text-[13.5px] leading-[1.65] text-ink-soft">
            <b className="font-semibold text-ink">{conflict.entityName}</b>의{' '}
            <span className="font-mono text-[12.5px]">{conflict.stateKey}</span> 값이 시점을 거슬러
            모순됩니다.
          </div>

          <div className="mb-[15px] flex flex-col gap-2 rounded-lg bg-paper p-[16px_18px]">
            <ConflictStateRow label="이전" color="#c4554d" state={conflict.earlier} />
            <ConflictStateRow label="이후" color="#cb912f" state={conflict.later} />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onGoto}
              className="h-8 rounded-[5px] bg-ink px-3.5 text-[12.5px] font-semibold text-white"
            >
              {gotoLabel}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="h-8 rounded-[5px] border border-line-strong bg-paper px-3.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
            >
              의도된 변화 — 무시
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConflictStateRow({
  label,
  color,
  state,
}: {
  label: string;
  color: string;
  state: ConflictChapterRef;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="w-10 shrink-0 font-semibold text-muted-ink">{label}</span>
      <span className="w-[92px] shrink-0 text-ink-soft">{state.chapterRef || '위치 미확인'}</span>
      <span className="font-semibold text-ink">{state.stateValue}</span>
    </div>
  );
}
