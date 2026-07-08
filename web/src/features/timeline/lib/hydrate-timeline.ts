import type { TimelineStateResponse } from '@/api';
// 엔티티별 타임라인 상태를 조회해 웹 mock 모양(TimelineState[])으로 매핑한다. chapterRef('6화 씬2')는
// 화·씬 목록에서 sceneId 위치를 찾아 조립 — eco: fetchWorkChapters를 여기서 별도 재조회한다
// (useWorkChapters와 캐시 공유 없음). 리뷰 화면 단독 로드용으로는 충분하고, 캐시 공유가 필요해지면 그때 합친다.
import { fetchWorkChapters } from '@/features/editor/lib/hydrate-chapters';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, TimelineState } from '@/features/shared/types';
import { worldBibleApi } from '@/features/world-bible/api/world-bible.api';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export function buildSceneRefs(
  chapters: Chapter[]
): Map<string, { chapterRef: string; chapterIndex: number }> {
  const refs = new Map<string, { chapterRef: string; chapterIndex: number }>();
  for (const chapter of chapters) {
    chapter.scenes.forEach((scene, i) => {
      refs.set(scene.id, {
        chapterRef: `${chapter.index}화 씬${i + 1}`,
        chapterIndex: chapter.index,
      });
    });
  }
  return refs;
}

function toTimelineState(
  state: TimelineStateResponse,
  entityName: string,
  ref: { chapterRef: string; chapterIndex: number } | undefined
): TimelineState {
  return {
    id: state.id,
    entityId: state.entityId,
    entityName,
    chapterRef: ref?.chapterRef ?? '',
    chapterIndex: ref?.chapterIndex ?? 0,
    key: state.stateKey,
    value: state.stateValue,
    source: state.source === 'ai_suggested' ? 'ai' : 'author',
  };
}

/** 작품의 모든 엔티티에 걸친 타임라인 상태를 조회해 웹 mock TimelineState[] 모양으로 조립한다. */
export async function fetchWorkTimeline(workId: string): Promise<TimelineState[]> {
  const [entities, chapters] = await Promise.all([
    worldBibleApi.entities({ path: { work_id: workId } }),
    fetchWorkChapters(workId),
  ]);
  const sceneRefs = buildSceneRefs(chapters);
  const perEntity = await Promise.all(
    entities.map(async (entity) => {
      const states = await worldBibleApi.timelineStates({
        path: { work_id: workId, entity_id: entity.id },
      });
      return states.map((state) => ({
        state: toTimelineState(state, entity.name, sceneRefs.get(state.sceneId)),
        createdAt: state.createdAt,
      }));
    })
  );
  // createdAt 오름차순 — 화면이 이 배열을 reverse()해서 최근 기록부터 보여준다.
  return perEntity
    .flat()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((s) => s.state);
}

/** 검토 화면 진입 시 서버의 엔티티별 타임라인 상태를 조회해 works.store의 해당 work.timeline으로 반영한다. */
export function useWorkTimelineStates(workId: string) {
  const setWorkTimeline = useWorksStore((s) => s.setWorkTimeline);
  const { data, isPending, isError } = useQuery({
    queryKey: ['work-timeline', workId],
    queryFn: () => fetchWorkTimeline(workId),
  });

  useEffect(() => {
    if (data) setWorkTimeline(workId, data);
  }, [data, workId, setWorkTimeline]);

  return { isPending, isError };
}
