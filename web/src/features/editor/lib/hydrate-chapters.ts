import type { ChapterResponse } from '@/api';
// 백엔드 계층(부=Episode·화=Chapter)을 조회해 웹 mock 모양(Chapter{partLabel,index,paragraphs,...})으로
// 매핑한다. 매핑 결정: Episode는 별도 엔티티로 두지 않고, 각 화의 partLabel 문자열(episode.title)로
// 평탄화한다 — 기존 mock 소비처(manuscript.tsx, timeline-screen.tsx, selectors.ts)가 그대로 동작한다.
import { manuscriptApi } from '@/features/editor/api/manuscript.api';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Paragraph } from '@/features/shared/types';
import { worldBibleApi } from '@/features/world-bible/api/world-bible.api';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export function toParagraphs(body: string): Paragraph[] {
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((text) => ({ text }));
}

// 화-엔티티 링크(설정 참고)는 화 조회에 포함되지 않아 화별로 따로 불러온다 —
// 이걸 빼면 reload 시 저장된 설정 참고가 빈 배열로 덮여 사라진다.
async function hydrateChapter(
  workId: string,
  chapter: ChapterResponse,
  partLabel: string,
  index: number
): Promise<Chapter> {
  const paragraphs = toParagraphs(chapter.body);
  const links = await worldBibleApi.chapterLinks({
    path: { work_id: workId, chapter_id: chapter.id },
  });
  return {
    id: chapter.id,
    episodeId: chapter.episodeId,
    partLabel,
    index,
    title: chapter.title,
    // eco: 'done' 상태는 백엔드에 대응 필드가 없음 — 본문 유무로만 draft/empty를 구분
    status: paragraphs.length ? 'draft' : 'empty',
    paragraphs,
    linkedEntityIds: links.map((link) => link.entityId),
    vectorMemory: [],
  };
}

/** 작품의 부→화를 전부 조회해 웹 mock Chapter[] 모양으로 조립한다(episode→chapter 순 조회). */
export async function fetchWorkChapters(workId: string): Promise<Chapter[]> {
  const episodes = await manuscriptApi.episodes({ path: { work_id: workId } });
  const perEpisode = await Promise.all(
    episodes.map(async (episode) => {
      const chapters = await manuscriptApi.chapters({
        path: { work_id: workId, episode_id: episode.id },
      });
      // 표시용 화 번호는 부 내 1-based 순번으로 매긴다 — order_index(정렬 키)는
      // 생성 시엔 1-based, 재정렬 시엔 0-based로 부여돼 값이 섞이므로 그대로 쓰면
      // "0화"가 나온다. 스토어의 생성·재정렬 로직과 동일한 1-based 순번 규칙으로 통일.
      const ordered = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
      return Promise.all(
        ordered.map((chapter, idx) => hydrateChapter(workId, chapter, episode.title, idx + 1))
      );
    })
  );
  return perEpisode.flat();
}

/** 작품 상세 화면 진입 시 서버의 부·화를 조회해 works.store의 해당 work.chapters로 반영한다. */
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
