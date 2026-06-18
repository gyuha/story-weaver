import { WorkShell } from '@/components/layout/work-shell';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Conflict, Work } from '@/features/shared/types';
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
              <Stat value={work.reviewSummary.scenes} label="씬" />
              <Stat value={work.reviewSummary.states} label="타임라인 상태 기록" />
              <Stat value={work.reviewSummary.conflicts} label="충돌 후보" danger />
            </div>

            {work.conflicts.map((conflict) => (
              <ConflictCallout
                key={conflict.id}
                conflict={conflict}
                onGoto={() => toast(`${conflict.appearChapter}화 씬으로 이동 (목업)`)}
                onDismiss={() => {
                  dismissConflict(work.id, conflict.id);
                  toast.success('충돌 후보를 무시했습니다');
                }}
              />
            ))}

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
  onGoto,
  onDismiss,
}: {
  conflict: Conflict;
  onGoto: () => void;
  onDismiss: () => void;
}) {
  const { from, to, total } = conflict.axis;
  const pos = (n: number) => Math.min(92, Math.max(8, (n / total) * 100));
  const fromPct = pos(from);
  const toPct = pos(to);
  const ticks = [1, Math.round(total / 3), Math.round((total * 2) / 3), to, total].filter(
    (v, i, a) => a.indexOf(v) === i
  );

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
          <div className="mb-4 text-[13.5px] leading-[1.65] text-ink-soft">{conflict.note}</div>

          <div className="mb-[15px] rounded-lg bg-paper p-[18px_20px_14px]">
            <div className="relative h-[54px]">
              <div className="absolute top-6 right-0 left-0 h-0.5 bg-line" />
              <div
                className="absolute top-6 h-0.5"
                style={{
                  left: `${fromPct}%`,
                  right: `${100 - toPct}%`,
                  background:
                    'repeating-linear-gradient(90deg,#e0a39f 0,#e0a39f 5px,transparent 5px,transparent 10px)',
                }}
              />
              <Dot pct={fromPct} color="#c4554d" label={`${from}화 · 사망`} />
              <Dot pct={toPct} color="#cb912f" label={`${to}화 · 등장`} />
              <div
                className="absolute top-px -translate-x-1/2 whitespace-nowrap text-[10.5px] text-[#c08581]"
                style={{ left: `${(fromPct + toPct) / 2}%` }}
              >
                부활 기록 없음
              </div>
            </div>
            <div className="mt-1 flex justify-between border-t border-[#f1f1ef] pt-2 text-[10px] text-line-strong">
              {ticks.map((t) => (
                <span key={t}>{t}화</span>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onGoto}
              className="h-8 rounded-[5px] bg-ink px-3.5 text-[12.5px] font-semibold text-white"
            >
              {to}화 씬으로 이동
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="h-8 rounded-[5px] border border-line-strong bg-paper px-3.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
            >
              의도된 회귀 — 무시
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <>
      <div className="absolute top-[11px] -translate-x-1/2" style={{ left: `${pct}%` }}>
        <span
          className="block size-[13px] rounded-full border-[2.5px] border-paper"
          style={{ background: color, boxShadow: `0 0 0 1.5px ${color}` }}
        />
      </div>
      <div
        className="absolute top-[31px] -translate-x-1/2 whitespace-nowrap text-center text-[11.5px] font-semibold leading-[1.4]"
        style={{ left: `${pct}%`, color }}
      >
        {label}
      </div>
    </>
  );
}
