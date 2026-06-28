import { useWorksStore } from '@/features/shared/store/works.store';
import { useAdminStore } from '../store/admin.store';

/** 통계 개요 — 회원·작품 지표는 mock store에서 집계, API 호출은 mock 수치. */
export function AdminStatsScreen() {
  const members = useAdminStore((s) => s.members);
  const works = useWorksStore((s) => s.works);

  const approved = members.filter((m) => m.status === 'approved').length;
  const pending = members.filter((m) => m.status === 'pending').length;

  const totalChapters = works.reduce((sum, w) => sum + w.stats.chapters, 0);
  const totalWords = works.reduce((sum, w) => sum + Number.parseFloat(w.stats.words || '0'), 0);

  return (
    <div className="mx-auto max-w-[760px] px-10 pt-9 pb-16">
      <h1 className="mb-1 font-serif text-[26px] font-bold tracking-[-0.01em] text-ink">통계</h1>
      <p className="mb-7 text-[13px] text-faint">
        서비스 운영 현황 개요입니다. (테스트 기간 mock 데이터)
      </p>

      <Section title="회원">
        <StatCard label="전체 회원" value={members.length} unit="명" />
        <StatCard label="승인됨" value={approved} unit="명" />
        <StatCard label="승인 대기" value={pending} unit="명" />
      </Section>

      <Section title="작품 (소설)">
        <StatCard label="전체 작품" value={works.length} unit="편" />
        <StatCard label="총 화수" value={totalChapters} unit="화" />
        <StatCard label="누적 글자수" value={totalWords.toFixed(1)} unit="만자" />
      </Section>

      <Section title="API 호출">
        <StatCard label="총 호출" value="12,840" unit="회" />
        <StatCard label="이번 달" value="3,210" unit="회" />
        <StatCard label="대략 비용" value="$48.2" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-2.5 text-[13px] font-semibold text-muted-ink">{title}</div>
      <div className="grid grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper px-4 py-3.5">
      <div className="mb-1.5 text-[12.5px] text-faint">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-serif text-[24px] font-bold leading-none text-ink">{value}</span>
        {unit && <span className="text-[12.5px] text-muted-ink">{unit}</span>}
      </div>
    </div>
  );
}
