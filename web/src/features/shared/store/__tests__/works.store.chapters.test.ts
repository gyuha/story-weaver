import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, Work } from '../../types';
import { useWorksStore } from '../works.store';

const mockCreateEpisode = vi.fn();
const mockUpdateEpisode = vi.fn();
const mockDeleteEpisode = vi.fn();
const mockReorderEpisodes = vi.fn();
const mockCreateChapter = vi.fn();
const mockUpdateChapter = vi.fn();
const mockDeleteChapter = vi.fn();
const mockReorderChapters = vi.fn();

vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: {
    createEpisode: (...args: unknown[]) => mockCreateEpisode(...args),
    updateEpisode: (...args: unknown[]) => mockUpdateEpisode(...args),
    deleteEpisode: (...args: unknown[]) => mockDeleteEpisode(...args),
    reorderEpisodes: (...args: unknown[]) => mockReorderEpisodes(...args),
    createChapter: (...args: unknown[]) => mockCreateChapter(...args),
    updateChapter: (...args: unknown[]) => mockUpdateChapter(...args),
    deleteChapter: (...args: unknown[]) => mockDeleteChapter(...args),
    reorderChapters: (...args: unknown[]) => mockReorderChapters(...args),
  },
}));

function makeWork(overrides: Partial<Work> & { id: string }): Work {
  return {
    title: '제목',
    shortLabel: '제',
    genre: '무협',
    subGenre: '회귀',
    keywords: [],
    style: '간결체',
    status: '구상',
    coverTheme: 'dark',
    stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
    lastEditedLabel: '방금',
    chapters: [],
    entities: [],
    timeline: [],
    conflicts: [],
    reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
    ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> & { id: string }): Chapter {
  return {
    episodeId: 'ep1',
    partLabel: '제1부',
    index: 1,
    title: '1화',
    status: 'empty',
    paragraphs: [],
    linkedEntityIds: [],
    vectorMemory: [],
    ...overrides,
  };
}

const WORK_ID = 'w1';

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({
    works: [
      makeWork({
        id: WORK_ID,
        chapters: [makeChapter({ id: 'ch1' })],
      }),
    ],
  });
});

describe('renameChapter', () => {
  it('실 API로 챕터 제목을 수정하고 성공 시 스토어에 반영한다', async () => {
    mockUpdateChapter.mockResolvedValue({
      id: 'ch1',
      workId: WORK_ID,
      episodeId: 'ep1',
      title: '새 제목',
      orderIndex: 1,
    });

    await useWorksStore.getState().renameChapter(WORK_ID, 'ch1', '새 제목');

    expect(mockUpdateChapter).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1', chapter_id: 'ch1' },
      body: { title: '새 제목' },
    });
    expect(useWorksStore.getState().works[0].chapters[0].title).toBe('새 제목');
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockUpdateChapter.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().renameChapter(WORK_ID, 'ch1', '새 제목')
    ).rejects.toThrow();
    expect(useWorksStore.getState().works[0].chapters[0].title).toBe('1화');
  });
});

describe('saveChapterSummary', () => {
  it('요약만 PATCH하고 성공 시 스토어에 반영한다 (task #68 S2)', async () => {
    mockUpdateChapter.mockResolvedValue({ id: 'ch1', workId: WORK_ID, episodeId: 'ep1' });

    await useWorksStore.getState().saveChapterSummary(WORK_ID, 'ch1', '주인공이 돌아왔다.');

    // body를 함께 보내면 백엔드가 본문을 재임베딩한다(task #67 S2) — 요약만 보낸다.
    expect(mockUpdateChapter).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1', chapter_id: 'ch1' },
      body: { summary: '주인공이 돌아왔다.' },
    });
    expect(useWorksStore.getState().works[0].chapters[0].summary).toBe('주인공이 돌아왔다.');
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockUpdateChapter.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().saveChapterSummary(WORK_ID, 'ch1', '요약')
    ).rejects.toThrow();
    expect(useWorksStore.getState().works[0].chapters[0].summary).toBeUndefined();
  });
});

describe('addChapter', () => {
  it('실 API로 화를 생성하고 성공 시 스토어에 추가한다', async () => {
    mockCreateChapter.mockResolvedValue({
      id: 'ch2',
      workId: WORK_ID,
      episodeId: 'ep1',
      title: '새 화',
      orderIndex: 2,
    });

    const id = await useWorksStore.getState().addChapter(WORK_ID, '제1부');

    expect(id).toBe('ch2');
    expect(mockCreateChapter).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1' },
      body: { title: '새 화', orderIndex: 2 },
    });
    const chapters = useWorksStore.getState().works[0].chapters;
    expect(chapters).toHaveLength(2);
    expect(chapters[1]).toEqual({
      id: 'ch2',
      episodeId: 'ep1',
      partLabel: '제1부',
      index: 2,
      title: '새 화',
      status: 'empty',
      paragraphs: [],
      linkedEntityIds: [],
      vectorMemory: [],
    });
  });
});

describe('addPart', () => {
  it('실 API로 새 부+첫 화를 생성하고 성공 시 스토어에 추가한다', async () => {
    mockCreateEpisode.mockResolvedValue({
      id: 'ep2',
      workId: WORK_ID,
      title: '제2부',
      orderIndex: 1,
    });
    mockCreateChapter.mockResolvedValue({
      id: 'ch3',
      workId: WORK_ID,
      episodeId: 'ep2',
      title: '새 화',
      orderIndex: 1,
    });

    const created = await useWorksStore.getState().addPart(WORK_ID);

    // 부와 함께 만든 첫 화의 id도 돌려준다 — 호출부가 그 화로 이동해야 한다.
    expect(created).toEqual({ label: '제2부', chapterId: 'ch3' });
    expect(mockCreateEpisode).toHaveBeenCalledWith({
      path: { work_id: WORK_ID },
      body: { title: '제2부', orderIndex: 1 },
    });
    expect(mockCreateChapter).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep2' },
      body: { title: '새 화', orderIndex: 1 },
    });
    const chapters = useWorksStore.getState().works[0].chapters;
    expect(chapters).toHaveLength(2);
    expect(chapters[1]).toMatchObject({
      id: 'ch3',
      episodeId: 'ep2',
      partLabel: '제2부',
      index: 1,
    });
  });
});

describe('renamePart', () => {
  it('실 API로 부 제목을 수정하고 성공 시 그 부의 모든 화 partLabel을 갱신한다', async () => {
    mockUpdateEpisode.mockResolvedValue({
      id: 'ep1',
      workId: WORK_ID,
      title: '프롤로그',
      orderIndex: 0,
    });

    await useWorksStore.getState().renamePart(WORK_ID, '제1부', '프롤로그');

    expect(mockUpdateEpisode).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1' },
      body: { title: '프롤로그' },
    });
    expect(useWorksStore.getState().works[0].chapters[0].partLabel).toBe('프롤로그');
  });
});

describe('deleteChapter', () => {
  it('실 API로 화를 삭제하고 성공 시 스토어에서 제거한다', async () => {
    mockDeleteChapter.mockResolvedValue(undefined);

    await useWorksStore.getState().deleteChapter(WORK_ID, 'ch1');

    expect(mockDeleteChapter).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1', chapter_id: 'ch1' },
    });
    expect(useWorksStore.getState().works[0].chapters).toHaveLength(0);
  });
});

describe('deletePart', () => {
  it('실 API로 부(Episode)를 삭제하고 성공 시 그 부의 화를 전부 제거한다', async () => {
    mockDeleteEpisode.mockResolvedValue(undefined);

    await useWorksStore.getState().deletePart(WORK_ID, '제1부');

    expect(mockDeleteEpisode).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1' },
    });
    expect(useWorksStore.getState().works[0].chapters).toHaveLength(0);
  });
});

describe('reorderChapters', () => {
  beforeEach(() => {
    useWorksStore.setState({
      works: [
        makeWork({
          id: WORK_ID,
          chapters: [
            makeChapter({
              id: 'ch1',
              episodeId: 'ep1',
              partLabel: '제1부',
              index: 1,
              title: '1화',
            }),
            makeChapter({
              id: 'ch2',
              episodeId: 'ep1',
              partLabel: '제1부',
              index: 2,
              title: '2화',
            }),
            makeChapter({
              id: 'ch3',
              episodeId: 'ep2',
              partLabel: '제2부',
              index: 1,
              title: '3화',
            }),
          ],
        }),
      ],
    });
  });

  it('실 API로 화 순서를 반영하고 성공 시 같은 부 안에서 순서·번호를 갱신한다', async () => {
    mockReorderChapters.mockResolvedValue(undefined);

    await useWorksStore.getState().reorderChapters(WORK_ID, 'ep1', ['ch2', 'ch1']);

    expect(mockReorderChapters).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, episode_id: 'ep1' },
      body: ['ch2', 'ch1'],
    });
    const chapters = useWorksStore.getState().works[0].chapters;
    expect(chapters.map((c) => c.id)).toEqual(['ch2', 'ch1', 'ch3']);
    expect(chapters.find((c) => c.id === 'ch2')?.index).toBe(1);
    expect(chapters.find((c) => c.id === 'ch1')?.index).toBe(2);
    expect(chapters.find((c) => c.id === 'ch3')?.index).toBe(1); // 다른 부는 영향 없음
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockReorderChapters.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().reorderChapters(WORK_ID, 'ep1', ['ch2', 'ch1'])
    ).rejects.toThrow();
    const chapters = useWorksStore.getState().works[0].chapters;
    expect(chapters.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3']);
  });
});

describe('reorderParts', () => {
  beforeEach(() => {
    useWorksStore.setState({
      works: [
        makeWork({
          id: WORK_ID,
          chapters: [
            makeChapter({
              id: 'ch1',
              episodeId: 'ep1',
              partLabel: '제1부',
              index: 1,
              title: '1화',
            }),
            makeChapter({
              id: 'ch2',
              episodeId: 'ep2',
              partLabel: '제2부',
              index: 1,
              title: '2화',
            }),
          ],
        }),
      ],
    });
  });

  it('실 API로 부 순서를 반영하고 성공 시 부 블록 순서를 재배치한다', async () => {
    mockReorderEpisodes.mockResolvedValue(undefined);

    await useWorksStore.getState().reorderParts(WORK_ID, ['제2부', '제1부']);

    expect(mockReorderEpisodes).toHaveBeenCalledWith({
      path: { work_id: WORK_ID },
      body: ['ep2', 'ep1'],
    });
    const chapters = useWorksStore.getState().works[0].chapters;
    expect(chapters.map((c) => c.partLabel)).toEqual(['제2부', '제1부']);
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockReorderEpisodes.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().reorderParts(WORK_ID, ['제2부', '제1부'])
    ).rejects.toThrow();
    const chapters = useWorksStore.getState().works[0].chapters;
    expect(chapters.map((c) => c.partLabel)).toEqual(['제1부', '제2부']);
  });
});
