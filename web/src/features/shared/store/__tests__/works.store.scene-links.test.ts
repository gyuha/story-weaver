import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../../types';
import { useWorksStore } from '../works.store';

const mockCreateChapterLink = vi.fn();
const mockDeleteChapterLink = vi.fn();

vi.mock('@/features/world-bible/api/world-bible.api', () => ({
  worldBibleApi: {
    createChapterLink: (...args: unknown[]) => mockCreateChapterLink(...args),
    deleteChapterLink: (...args: unknown[]) => mockDeleteChapterLink(...args),
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

const WORK_ID = 'w1';
const CHAPTER_ID = 'ch1';

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({
    works: [
      makeWork({
        id: WORK_ID,
        chapters: [
          {
            id: CHAPTER_ID,
            episodeId: 'ep1',
            partLabel: '제1부',
            index: 1,
            title: '1화',
            status: 'draft',
            paragraphs: [],
            linkedEntityIds: ['e-existing'],
            vectorMemory: [],
          },
        ],
      }),
    ],
  });
});

function getChapter() {
  return useWorksStore.getState().works[0].chapters[0];
}

describe('addChapterEntityLinks', () => {
  it('실 API로 링크를 생성하고 성공 시 스토어에 반영한다', async () => {
    mockCreateChapterLink.mockResolvedValue({
      id: 'link1',
      workId: WORK_ID,
      chapterId: CHAPTER_ID,
      entityId: 'e-new',
      source: 'author',
      createdAt: '2026-01-01T00:00:00Z',
    });

    await useWorksStore.getState().addChapterEntityLinks(WORK_ID, CHAPTER_ID, ['e-new']);

    expect(mockCreateChapterLink).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: CHAPTER_ID },
      body: { entityId: 'e-new' },
    });
    expect(getChapter().linkedEntityIds).toEqual(['e-existing', 'e-new']);
  });

  it('이미 링크된 엔티티는 API를 호출하지 않고 중복 추가하지 않는다', async () => {
    await useWorksStore.getState().addChapterEntityLinks(WORK_ID, CHAPTER_ID, ['e-existing']);

    expect(mockCreateChapterLink).not.toHaveBeenCalled();
    expect(getChapter().linkedEntityIds).toEqual(['e-existing']);
  });

  it('실패(예: cross-tenant 403) 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockCreateChapterLink.mockRejectedValue(new Error('403 Forbidden'));

    await expect(
      useWorksStore.getState().addChapterEntityLinks(WORK_ID, CHAPTER_ID, ['e-new'])
    ).rejects.toThrow('403 Forbidden');
    expect(getChapter().linkedEntityIds).toEqual(['e-existing']);
  });
});

describe('removeChapterEntityLink', () => {
  it('실 API로 링크를 삭제하고 성공 시 스토어에서 제거한다', async () => {
    mockDeleteChapterLink.mockResolvedValue(undefined);

    await useWorksStore.getState().removeChapterEntityLink(WORK_ID, CHAPTER_ID, 'e-existing');

    expect(mockDeleteChapterLink).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: CHAPTER_ID, entity_id: 'e-existing' },
    });
    expect(getChapter().linkedEntityIds).toEqual([]);
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockDeleteChapterLink.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().removeChapterEntityLink(WORK_ID, CHAPTER_ID, 'e-existing')
    ).rejects.toThrow('network error');
    expect(getChapter().linkedEntityIds).toEqual(['e-existing']);
  });
});
