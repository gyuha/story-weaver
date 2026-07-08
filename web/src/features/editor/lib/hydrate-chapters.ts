import type { SceneResponse } from '@/api';
// 백엔드 계층(부=Episode·화=Chapter·씬=Scene)을 조회해 웹 mock 모양(Chapter{partLabel,index,scenes})으로
// 매핑한다. 매핑 결정: Episode는 별도 엔티티로 두지 않고, 각 화의 partLabel 문자열(episode.title)로
// 평탄화한다 — 기존 mock 소비처(manuscript.tsx, timeline-screen.tsx, selectors.ts)가 그대로 동작한다.
import { manuscriptApi } from '@/features/editor/api/manuscript.api';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Paragraph, Scene } from '@/features/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export function toParagraphs(body: string): Paragraph[] {
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((text) => ({ text }));
}

function toScene(scene: SceneResponse): Scene {
  const paragraphs = toParagraphs(scene.body);
  return {
    id: scene.id,
    title: scene.title ?? '새 씬',
    // eco: 'done' 상태는 백엔드에 대응 필드가 없음 — 본문 유무로만 draft/empty를 구분
    status: paragraphs.length ? 'draft' : 'empty',
    paragraphs,
    linkedEntityIds: [],
    vectorMemory: [],
  };
}

/** 작품의 부→화→씬을 전부 조회해 웹 mock Chapter[] 모양으로 조립한다(episode→chapter→scene 순 조회). */
export async function fetchWorkChapters(workId: string): Promise<Chapter[]> {
  const episodes = await manuscriptApi.episodes({ path: { work_id: workId } });
  const perEpisode = await Promise.all(
    episodes.map(async (episode) => {
      const chapters = await manuscriptApi.chapters({
        path: { work_id: workId, episode_id: episode.id },
      });
      return Promise.all(
        chapters.map(async (chapter): Promise<Chapter> => {
          const scenes = await manuscriptApi.scenes({
            path: { work_id: workId, episode_id: episode.id, chapter_id: chapter.id },
          });
          return {
            id: chapter.id,
            episodeId: episode.id,
            partLabel: episode.title,
            index: chapter.orderIndex,
            title: chapter.title,
            scenes: scenes.map(toScene),
          };
        })
      );
    })
  );
  return perEpisode.flat();
}

/** 작품 상세 화면 진입 시 서버의 부·화·씬을 조회해 works.store의 해당 work.chapters로 반영한다. */
export function useWorkChapters(workId: string) {
  const setWorkChapters = useWorksStore((s) => s.setWorkChapters);
  const { data, isPending, isError } = useQuery({
    queryKey: ['manuscript-chapters', workId],
    queryFn: () => fetchWorkChapters(workId),
  });

  useEffect(() => {
    if (data) setWorkChapters(workId, data);
  }, [data, workId, setWorkChapters]);

  return { isPending, isError };
}
