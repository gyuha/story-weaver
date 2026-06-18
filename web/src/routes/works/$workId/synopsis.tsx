import { WorkShell } from '@/components/layout/work-shell';
import { requireAuth } from '@/features/auth/lib/guard';
import { useWork } from '@/features/shared/store/selectors';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/works/$workId/synopsis')({
  beforeLoad: ({ params }) => requireAuth(`/works/${params.workId}/synopsis`),
  component: SynopsisPage,
});

function SynopsisPage() {
  const { workId } = useParams({ from: '/works/$workId/synopsis' });
  const work = useWork(workId);
  if (!work) return null;

  return (
    <WorkShell work={work} active="synopsis">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[620px] px-10 pt-12 pb-16">
          <div className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-genre">
            {work.genre} · {work.subGenre}
          </div>
          <h1 className="mb-4 font-serif text-[30px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
            {work.title}
          </h1>
          <div className="mb-8 flex flex-wrap gap-2">
            {work.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full border border-line px-[11px] py-1.5 text-[12.5px] text-ink-soft"
              >
                {k}
              </span>
            ))}
            <span className="rounded-full bg-surface px-[11px] py-1.5 text-[12.5px] text-muted-ink">
              {work.style}
            </span>
          </div>

          <p className="font-serif text-[16.5px] leading-[1.95] text-ink">
            {work.entities.find((e) => e.type === '인물')?.summary ??
              '아직 시놉시스가 작성되지 않았습니다. 주인공과 핵심 목표를 적어 작품의 큰 줄기를 잡아 보세요.'}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <SynopsisStat value={`${work.stats.chapters}`} label="화" />
            <SynopsisStat value={`${work.stats.words}${work.stats.wordsUnit}`} label="분량" />
            <SynopsisStat value={`${work.entities.length}`} label="설정 카드" />
          </div>
        </div>
      </div>
    </WorkShell>
  );
}

function SynopsisStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[9px] border border-line p-[14px_16px]">
      <div className="mb-1 text-[20px] font-bold text-ink">{value}</div>
      <div className="text-[12px] text-muted-ink">{label}</div>
    </div>
  );
}
