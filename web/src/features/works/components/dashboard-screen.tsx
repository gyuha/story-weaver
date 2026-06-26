import { AppShell } from '@/components/layout/app-shell';
import { useUsage, useWorks } from '@/features/shared/store/selectors';
import type { Work } from '@/features/shared/types';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CircleAlert, Plus, Sparkles } from 'lucide-react';
import { NewWorkCard, WorkCard } from './work-card';

/** stats.words를 만자 기준으로 정규화(천자 → /10) */
function toManja(work: Work): number {
  const v = Number.parseFloat(work.stats.words) || 0;
  return work.stats.wordsUnit === '천자' ? v / 10 : v;
}

/** 작품 대시보드 화면 (셸 포함) — /works */
export function DashboardScreen() {
  const works = useWorks();
  const usage = useUsage();

  const resume = works[0];
  const lastEdited = resume?.lastEditedLabel.split(' · ')[0] ?? '방금';
  const totalManja = works.reduce((s, w) => s + toManja(w), 0);
  const ongoing = works.filter((w) => w.status === '연재 중').length;
  const totalConflicts = works.reduce((s, w) => s + w.reviewSummary.conflicts, 0);
  const aiPct = Math.round((usage.usedTokens / usage.totalTokens) * 100);
  const fmtToken = (n: number) => `${Math.round(n / 10000)}만`;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] p-[38px_40px]">
        {/* 헤더 */}
        <header className="mb-7 flex items-end justify-between">
          <div>
            <h1 className="mb-1.5 font-sans text-[30px] font-bold tracking-[-0.02em]">내 작품</h1>
            <div className="text-sm text-muted-ink">
              {works.length}개의 작품 · 마지막 작업 {lastEdited}
            </div>
          </div>
          <Link
            to="/works/new"
            className="flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[5px] bg-primary px-[15px] text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" strokeWidth={2.2} />새 작품
          </Link>
        </header>

        {/* 상단 활동 카드: 좌(이어서 쓰기 + 요약 통계) / 우(AI 사용량 + 검토 필요) */}
        {resume && (
          <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 이어서 쓰기 */}
            <div className="flex flex-col justify-between rounded-[12px] border border-line bg-paper p-5 lg:col-span-2">
              <div>
                <div className="mb-1.5 text-[12.5px] font-semibold tracking-[0.02em] text-faint">
                  이어서 쓰기
                </div>
                <div className="font-serif text-[21px] font-bold leading-[1.3] text-ink">
                  {resume.title}
                </div>
                <div className="mt-1 text-[13px] text-muted-ink">{resume.lastEditedLabel}</div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-5">
                  <Metric value={`${works.length}`} label="작품" />
                  <Metric value={totalManja.toFixed(1)} label="만자" />
                  <Metric value={`${ongoing}`} label="연재 중" />
                </div>
                <Link
                  to="/works/$workId/write"
                  params={{ workId: resume.id }}
                  className="flex h-9 items-center gap-1.5 rounded-[6px] bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                >
                  집필 계속
                  <ArrowRight className="size-4" strokeWidth={2.2} />
                </Link>
              </div>
            </div>

            {/* AI 사용량 + 검토 필요 */}
            <div className="flex flex-col gap-4">
              <div className="rounded-[12px] border border-line bg-paper p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-ink">
                    <Sparkles className="size-[15px] text-ai" strokeWidth={2} />이 달 AI 생성
                  </span>
                  <span className="text-sm font-semibold text-ink">{aiPct}%</span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#ececeb]">
                  <div className="h-full bg-primary" style={{ width: `${aiPct}%` }} />
                </div>
                <div className="mt-2 text-[11.5px] text-faint">
                  {usage.plan} · {fmtToken(usage.usedTokens)} / {fmtToken(usage.totalTokens)} 토큰
                </div>
              </div>

              <div className="flex flex-1 items-center gap-3 rounded-[12px] border border-line bg-paper p-4">
                <span
                  className={
                    totalConflicts > 0
                      ? 'grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger'
                      : 'grid size-9 shrink-0 place-items-center rounded-full bg-surface text-faint'
                  }
                >
                  <CircleAlert className="size-[18px]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">
                    {totalConflicts > 0 ? `검토 필요 ${totalConflicts}건` : '검토할 충돌 없음'}
                  </div>
                  <div className="truncate text-[12px] text-faint">
                    {totalConflicts > 0 ? '설정 충돌이 감지되었습니다' : '설정 충돌이 없습니다'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 작품 그리드 */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {works.map((work) => (
            <WorkCard key={work.id} work={work} />
          ))}
          <NewWorkCard />
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[17px] font-bold text-ink">{value}</span>
      <span className="text-[12.5px] text-muted-ink">{label}</span>
    </div>
  );
}
