import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEpisodes = vi.fn();
const mockChapters = vi.fn();
const mockChapterLinks = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: {
    episodes: (...args: unknown[]) => mockEpisodes(...args),
    chapters: (...args: unknown[]) => mockChapters(...args),
  },
}));
vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    chapterLinks: (...args: unknown[]) => mockChapterLinks(...args),
  },
}));

import { fetchWorkChapters, useWorkChapters } from '../hydrate-chapters';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const WORK_ID = 'w1';

beforeEach(() => {
  vi.clearAllMocks();
  mockChapterLinks.mockResolvedValue([]);
  useWorksStore.setState({
    works: [
      {
        id: WORK_ID,
        title: '천뢰검전',
        shortLabel: '천',
        genre: '무협',
        subGenre: '회귀',
        keywords: [],
        style: '간결체',
        styleNote: null,
        status: '연재 중',
        coverTheme: 'dark',
        stats: { chapters: 0, words: '0', wordsUnit: '만자', characters: 0, progress: 0 },
        lastEditedLabel: '방금',
        chapters: [],
        entities: [],
        timeline: [],
        conflicts: [],
        reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
      },
    ],
  });
});

describe('fetchWorkChapters', () => {
  it('부→화를 조회해 웹 Chapter[] 모양으로 조립한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      {
        id: 'ch1',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: '1화',
        orderIndex: 1,
        globalSeq: 1,
        body: '첫 문단\n둘째 문단',
      },
    ]);

    const chapters = await fetchWorkChapters(WORK_ID);

    expect(chapters).toEqual([
      {
        id: 'ch1',
        episodeId: 'ep1',
        partLabel: '제1부',
        index: 1,
        title: '1화',
        status: 'draft',
        paragraphs: [{ text: '첫 문단' }, { text: '둘째 문단' }],
        linkedEntityIds: [],
        vectorMemory: [],
      },
    ]);
    expect(mockEpisodes).toHaveBeenCalledWith({ path: { work_id: WORK_ID } });
    expect(mockChapters).toHaveBeenCalledWith({ path: { work_id: WORK_ID, episode_id: 'ep1' } });
    expect(mockChapterLinks).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: 'ch1' },
    });
  });

  it('서버가 준 화 요약을 Chapter.summary로 옮긴다 (task #68 S1)', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      {
        id: 'ch1',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: '1화',
        orderIndex: 1,
        globalSeq: 1,
        body: '본문',
        summary: '주인공이 10년 전으로 돌아왔다.',
      },
    ]);

    const chapters = await fetchWorkChapters(WORK_ID);

    expect(chapters[0].summary).toBe('주인공이 10년 전으로 돌아왔다.');
  });

  it('요약이 없는 화도 깨지지 않는다 — 아직 요약하지 않은 화는 NULL이다 (task #68 S1)', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      {
        id: 'ch1',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: '1화',
        orderIndex: 1,
        globalSeq: 1,
        body: '본문',
        summary: null,
      },
    ]);

    const chapters = await fetchWorkChapters(WORK_ID);

    expect(chapters[0].summary).toBeUndefined();
  });

  it('order_index가 0-based이거나 섞여 있어도 부 내 1-based 순번으로 표시한다(0화 방지)', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    // 재정렬을 거쳐 0-based로 섞인 order_index(2,0,1) — 그대로 쓰면 "0화"가 나온다.
    mockChapters.mockResolvedValue([
      {
        id: 'chC',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: 'C',
        orderIndex: 2,
        globalSeq: 3,
        body: '',
      },
      {
        id: 'chA',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: 'A',
        orderIndex: 0,
        globalSeq: 1,
        body: '',
      },
      {
        id: 'chB',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: 'B',
        orderIndex: 1,
        globalSeq: 2,
        body: '',
      },
    ]);

    const chapters = await fetchWorkChapters(WORK_ID);

    // order_index 오름차순(A=0,B=1,C=2)으로 정렬된 뒤 1,2,3으로 표시 — 0화 없음.
    expect(chapters.map((c) => [c.id, c.index])).toEqual([
      ['chA', 1],
      ['chB', 2],
      ['chC', 3],
    ]);
  });

  it('저장된 화-엔티티 링크(설정 참고)를 linkedEntityIds로 하이드레이션한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      {
        id: 'ch1',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: '1화',
        orderIndex: 1,
        globalSeq: 1,
        body: '본문',
      },
    ]);
    mockChapterLinks.mockResolvedValue([
      { id: 'l1', workId: WORK_ID, chapterId: 'ch1', entityId: 'e1', source: 'author' },
      { id: 'l2', workId: WORK_ID, chapterId: 'ch1', entityId: 'e2', source: 'author' },
    ]);

    const [chapter] = await fetchWorkChapters(WORK_ID);

    expect(chapter.linkedEntityIds).toEqual(['e1', 'e2']);
    expect(mockChapterLinks).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: 'ch1' },
    });
  });

  it('본문이 빈 화는 status: empty로 매핑한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      {
        id: 'ch1',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: '1화',
        orderIndex: 1,
        globalSeq: 1,
        body: '',
      },
    ]);

    const [chapter] = await fetchWorkChapters(WORK_ID);

    expect(chapter).toMatchObject({ status: 'empty', paragraphs: [] });
  });
});

describe('useWorkChapters', () => {
  it('로딩 중에는 isPending: true를 반환한다', () => {
    mockEpisodes.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWorkChapters(WORK_ID), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('조회가 실패하면 isError: true를 반환한다', async () => {
    mockEpisodes.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useWorkChapters(WORK_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('성공 시 store의 해당 work.chapters를 서버 응답으로 교체한다', async () => {
    mockEpisodes.mockResolvedValue([{ id: 'ep1', workId: WORK_ID, title: '제1부', orderIndex: 0 }]);
    mockChapters.mockResolvedValue([
      {
        id: 'ch1',
        workId: WORK_ID,
        episodeId: 'ep1',
        title: '1화',
        orderIndex: 1,
        globalSeq: 1,
        body: '',
      },
    ]);

    renderHook(() => useWorkChapters(WORK_ID), { wrapper });

    await waitFor(() => {
      const work = useWorksStore.getState().works.find((w) => w.id === WORK_ID);
      expect(work?.chapters).toEqual([
        {
          id: 'ch1',
          episodeId: 'ep1',
          partLabel: '제1부',
          index: 1,
          title: '1화',
          status: 'empty',
          paragraphs: [],
          linkedEntityIds: [],
          vectorMemory: [],
        },
      ]);
    });
  });
});
