import type { RelationshipEdge } from '@/api';
import { WorkShell } from '@/components/layout/work-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { Work } from '@/features/shared/types';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { relationshipsApi } from '../api/relationships.api';

/** 엣지를 sourceEntityId 기준으로 묶어 최초 등장 순서를 유지한다. */
function groupBySource(edges: RelationshipEdge[]) {
  const groups: { sourceEntityId: string; sourceName: string; edges: RelationshipEdge[] }[] = [];
  const index = new Map<string, number>();
  for (const edge of edges) {
    const i = index.get(edge.sourceEntityId);
    if (i === undefined) {
      index.set(edge.sourceEntityId, groups.length);
      groups.push({
        sourceEntityId: edge.sourceEntityId,
        sourceName: edge.sourceName,
        edges: [edge],
      });
    } else {
      groups[i].edges.push(edge);
    }
  }
  return groups;
}

export function RelationshipGraphScreen({ work }: { work: Work }) {
  const [chapterId, setChapterId] = useState('');
  const { data, isPending, isError } = useQuery({
    queryKey: ['work-relationships', work.id, chapterId || null],
    queryFn: () =>
      relationshipsApi.graph({
        path: { work_id: work.id },
        query: chapterId ? { up_to_chapter_id: chapterId } : undefined,
      }),
  });

  return (
    <WorkShell work={work} active="bible">
      <div className="flex h-full flex-col">
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-ink/[0.06] px-10 text-[13.5px]">
          <span className="text-muted-ink">{work.title}</span>
          <ChevronRight className="size-3 text-line-strong" strokeWidth={2} />
          <span className="font-medium text-ink">관계도</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="max-w-[840px] px-10 py-[34px]">
            <div className="mb-[22px] flex items-center justify-between gap-3">
              <h1 className="text-[28px] font-bold tracking-[-0.02em]">관계도</h1>
              <select
                aria-label="시점 선택"
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="h-9 rounded-md border border-line bg-paper px-3 text-[13px] text-ink-soft"
              >
                <option value="">전체(최신 시점)</option>
                {work.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.index}화 · {chapter.title}
                  </option>
                ))}
              </select>
            </div>

            {isPending && (
              <output className="block" aria-label="관계도를 불러오는 중">
                <Skeleton className="mb-3 h-8 w-48" />
                <Skeleton className="h-40 w-full" />
              </output>
            )}

            {isError && (
              <Alert variant="destructive">
                <AlertTitle>관계도를 불러오지 못했습니다</AlertTitle>
                <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
              </Alert>
            )}

            {data && (
              <>
                {data.summary && (
                  <div className="mb-5 rounded-[10px] border border-ai/20 bg-ai/[0.06] p-[16px_18px]">
                    <div className="mb-1.5 text-[13px] font-semibold text-ai">
                      이 시점까지의 관계 요약
                    </div>
                    <p className="text-[13.5px] leading-[1.6] text-ink-soft">{data.summary}</p>
                  </div>
                )}

                {data.edges.length === 0 ? (
                  <div className="text-sm text-muted-ink">아직 등록된 관계가 없습니다.</div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {groupBySource(data.edges).map((group) => (
                      <div
                        key={group.sourceEntityId}
                        className="rounded-[9px] border border-line p-4"
                      >
                        <div className="mb-2 text-[14px] font-bold text-ink">
                          {group.sourceName}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {group.edges.map((edge) => (
                            <div key={edge.targetEntityId} className="text-[13.5px] text-ink-soft">
                              <span className="text-ai">{edge.type}</span>
                              {' → '}
                              <span className="font-medium text-ink">{edge.targetName}</span>
                              {edge.note && <span className="ml-2 text-faint">({edge.note})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </WorkShell>
  );
}
