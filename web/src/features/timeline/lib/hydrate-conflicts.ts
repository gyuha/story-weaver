import type { ConflictResponse } from '@/api';
// 작품의 설정 충돌 후보(같은 엔티티·같은 예약 state_key의 시점 역행 모순)를 조회해 웹 mock 모양
// (Conflict[])으로 매핑한다. chapterId → chapterRef 조립은 hydrate-timeline과 동일한 buildChapterRefs를 재사용.
// eco: fetchWorkChapters를 여기서 별도 재조회한다(useWorkTimelineStates와 캐시 공유 없음) — 검토 화면
// 단독 로드용으로는 충분하고, 캐시 공유가 필요해지면 그때 합친다.
import { fetchWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Conflict, ConflictChapterRef } from '@/features/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { conflictsApi } from '../api/conflicts.api';
import { buildChapterRefs } from './hydrate-timeline';

function toChapterRef(
  ref: ConflictResponse['earlier'],
  chapterRefs: ReturnType<typeof buildChapterRefs>
): ConflictChapterRef {
  return {
    chapterId: ref.chapterId,
    chapterRef: chapterRefs.get(ref.chapterId)?.chapterRef ?? '',
    globalSeq: ref.globalSeq,
    stateValue: ref.stateValue,
  };
}

function toConflict(
  response: ConflictResponse,
  chapterRefs: ReturnType<typeof buildChapterRefs>
): Conflict {
  return {
    id: `${response.earlier.id}_${response.later.id}`,
    entityId: response.entityId,
    entityName: response.entityName,
    stateKey: response.stateKey,
    earlier: toChapterRef(response.earlier, chapterRefs),
    later: toChapterRef(response.later, chapterRefs),
  };
}

/** 작품의 설정 충돌 후보를 조회해 웹 mock Conflict[] 모양으로 조립한다. */
export async function fetchWorkConflicts(workId: string): Promise<Conflict[]> {
  const [conflicts, chapters] = await Promise.all([
    conflictsApi.list({ path: { work_id: workId } }),
    fetchWorkChapters(workId),
  ]);
  const chapterRefs = buildChapterRefs(chapters);
  return conflicts.map((c) => toConflict(c, chapterRefs));
}

/** 검토 화면 진입 시 서버의 설정 충돌 후보를 조회해 works.store의 해당 work.conflicts로 반영한다. */
export function useWorkConflicts(workId: string) {
  const setWorkConflicts = useWorksStore((s) => s.setWorkConflicts);
  const { data, isPending, isError } = useQuery({
    queryKey: ['work-conflicts', workId],
    queryFn: () => fetchWorkConflicts(workId),
  });

  useEffect(() => {
    if (data) setWorkConflicts(workId, data);
  }, [data, workId, setWorkConflicts]);

  return { isPending, isError };
}
