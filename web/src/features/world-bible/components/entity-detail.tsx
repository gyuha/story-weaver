import type { Entity, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Clock, Pencil } from 'lucide-react';

export function EntityDetail({ work, entity }: { work: Work; entity: Entity }) {
  const states = work.timeline
    .filter((t) => t.entityId === entity.id)
    .sort((a, b) => a.chapterIndex - b.chapterIndex);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-paper">
      <div className="max-w-[660px] px-12 pt-[34px] pb-16">
        <div className="mb-2 flex items-start gap-4">
          {entity.imageUrl ? (
            <img
              src={entity.imageUrl}
              alt={entity.name}
              className="size-[58px] shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="grid size-[58px] shrink-0 place-items-center rounded-xl bg-[#f1f1ef] text-[30px]">
              {entity.emoji}
            </div>
          )}
          <div className="pt-[3px]">
            <div className="mb-[5px] flex items-center gap-2.5">
              <h1 className="font-serif text-[27px] font-bold leading-[1.1] text-ink">
                {entity.name}
                {entity.hanja && (
                  <span className="ml-1.5 text-[18px] font-medium text-faint">{entity.hanja}</span>
                )}
              </h1>
              <span className="rounded-full border border-line px-[9px] py-1 text-[11.5px] font-medium text-muted-ink">
                {entity.type}
              </span>
            </div>
            {entity.alias && (
              <div className="text-[13px] leading-[1.4] text-faint">별칭 · {entity.alias}</div>
            )}
          </div>
          <Link
            to="/works/$workId/bible/edit"
            params={{ workId: work.id }}
            search={{ entity: entity.id }}
            className="mt-[3px] ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface"
          >
            <Pencil className="size-[14px]" strokeWidth={2} />
            수정
          </Link>
        </div>

        <p className="my-[14px] mb-[26px] font-serif text-[15px] leading-[1.7] text-ink-soft">
          {entity.summary}
        </p>

        <div className="flex flex-col">
          {entity.fields.map((f) => (
            <Row key={f.label} label={f.label}>
              <span className="text-sm leading-[1.65] text-ink">{f.value}</span>
            </Row>
          ))}

          {entity.sampleLines && entity.sampleLines.length > 0 && (
            <Row label="샘플 대사">
              <div className="flex flex-col gap-[7px]">
                {entity.sampleLines.map((line) => (
                  <span
                    key={line}
                    className="border-l-[2.5px] border-line-strong pl-[11px] font-serif text-sm italic leading-[1.5] text-ink-soft"
                  >
                    "{line}"
                  </span>
                ))}
              </div>
            </Row>
          )}

          {entity.relations && entity.relations.length > 0 && (
            <Row label="관계" last>
              <div className="flex flex-wrap gap-[7px]">
                {entity.relations.map((r) => (
                  <span
                    key={r.name}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[12.5px]',
                      r.tone === 'enemy' ? 'bg-[#fdebec] text-[#c4554d]' : 'bg-[#f1f1ef] text-ink'
                    )}
                  >
                    {r.name}
                    <span className={r.tone === 'enemy' ? 'text-[#d99]' : 'text-faint'}>
                      · {r.role}
                    </span>
                  </span>
                ))}
              </div>
            </Row>
          )}
        </div>

        {states.length > 0 && (
          <div className="mt-[26px]">
            <div className="mb-[15px] flex items-center gap-2">
              <Clock className="size-[15px] text-muted-ink" strokeWidth={2} />
              <span className="text-sm font-semibold text-ink">타임라인 상태</span>
              <span className="text-[12px] text-faint">시점별 상태 기록</span>
            </div>
            <div className="relative pl-[18px]">
              <div className="absolute top-[5px] bottom-[18px] left-1 w-[1.5px] bg-line" />
              {states.map((s) => (
                <div key={s.id} className="relative mb-[15px] last:mb-0">
                  <span
                    className={cn(
                      'absolute top-[3px] -left-[18px] size-[9px] rounded-full border-2 border-paper',
                      s.pending
                        ? 'bg-ai shadow-[0_0_0_1.5px_rgba(144,101,176,0.4)]'
                        : 'bg-ink shadow-[0_0_0_1.5px_var(--line-strong)]'
                    )}
                  />
                  <div className="flex items-center gap-[7px]">
                    <div className="text-[12.5px] font-semibold leading-[1.3] text-ink">
                      {s.chapterRef}
                      {s.pending && ' · 현재'}
                    </div>
                    {s.pending && (
                      <span className="rounded bg-ai/[0.12] px-1.5 py-[3px] text-[10.5px] font-medium text-ai">
                        AI 제안 · 검토 대기
                      </span>
                    )}
                  </div>
                  <div className="mt-[3px] text-[12.5px] leading-[1.5] text-muted-ink">
                    <span className="font-mono text-faint">{s.key}</span> → {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-[18px] border-t border-ink/[0.07] py-[13px]',
        last && 'border-b border-ink/[0.07]'
      )}
    >
      <span className="w-[72px] shrink-0 text-[13px] leading-[1.6] font-medium text-faint">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
