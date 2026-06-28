import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAdminStore } from '../store/admin.store';
import type { Member, MemberStatus } from '../types';

const STATUS_META: Record<MemberStatus, { label: string; className: string }> = {
  pending: { label: '승인 대기', className: 'bg-[#fdf3e3] text-[#b4791f]' },
  approved: { label: '승인됨', className: 'bg-[#e7f3ec] text-[#3f7a52]' },
  rejected: { label: '거부됨', className: 'bg-[#fdebec] text-[#c4554d]' },
};

const FILTERS: { value: MemberStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '승인 대기' },
  { value: 'approved', label: '승인됨' },
  { value: 'rejected', label: '거부됨' },
];

export function AccountApprovalScreen() {
  const members = useAdminStore((s) => s.members);
  const approveMember = useAdminStore((s) => s.approveMember);
  const rejectMember = useAdminStore((s) => s.rejectMember);
  const [filter, setFilter] = useState<MemberStatus | 'all'>('all');

  const pending = members.filter((m) => m.status === 'pending');
  const filtered = filter === 'all' ? members : members.filter((m) => m.status === filter);

  const approve = (m: Member) => {
    approveMember(m.id);
    toast.success(`'${m.displayName}' 계정을 승인했습니다`);
  };
  const reject = (m: Member) => {
    rejectMember(m.id);
    toast.success(`'${m.displayName}' 계정을 거부했습니다`);
  };

  return (
    <div className="mx-auto max-w-[760px] px-10 pt-9 pb-16">
      <h1 className="mb-1 font-serif text-[26px] font-bold tracking-[-0.01em] text-ink">
        계정 승인
      </h1>
      <p className="mb-7 text-[13px] text-faint">
        가입한 계정에 서비스 사용을 허가합니다. 초기 테스트 기간 동안 승인된 계정만 사용할 수
        있습니다.
      </p>

      {/* 승인 대기 큐 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-muted-ink">승인 대기</span>
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-white">
          {pending.length}
        </span>
      </div>
      {pending.length === 0 ? (
        <div className="mb-9 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint">
          대기 중인 계정이 없습니다.
        </div>
      ) : (
        <div className="mb-9 flex flex-col gap-2">
          {pending.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{m.displayName}</div>
                <div className="truncate text-[12.5px] text-faint">
                  {m.email} · 가입 {m.signupDate}
                </div>
              </div>
              <button
                type="button"
                onClick={() => approve(m)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Check className="size-4" strokeWidth={2.2} />
                승인
              </button>
              <button
                type="button"
                onClick={() => reject(m)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-[#fdebec] hover:text-[#c4554d]"
              >
                <X className="size-4" strokeWidth={2.2} />
                거부
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 전체 회원 목록 */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-ink">전체 회원</span>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
                filter === f.value ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/[0.04]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-faint">해당 회원이 없습니다.</div>
        ) : (
          filtered.map((m, i) => (
            <div
              key={m.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                i > 0 && 'border-t border-ink/[0.07]'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{m.displayName}</div>
                <div className="truncate text-[12.5px] text-faint">{m.email}</div>
              </div>
              <span className="hidden w-[64px] shrink-0 text-right text-[12.5px] text-muted-ink sm:block">
                작품 {m.workCount}
              </span>
              <span className="hidden w-[84px] shrink-0 text-right text-[12.5px] text-faint sm:block">
                {m.signupDate}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
                  STATUS_META[m.status].className
                )}
              >
                {STATUS_META[m.status].label}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
