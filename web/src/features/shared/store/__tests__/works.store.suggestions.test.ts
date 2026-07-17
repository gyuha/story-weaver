import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../../types';
import { useWorksStore } from '../works.store';

const mockExtract = vi.fn();
const mockList = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();

vi.mock('@/features/memory/api/suggestion.api', () => ({
  suggestionApi: {
    extract: (...args: unknown[]) => mockExtract(...args),
    list: (...args: unknown[]) => mockList(...args),
    approve: (...args: unknown[]) => mockApprove(...args),
    reject: (...args: unknown[]) => mockReject(...args),
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
            linkedEntityIds: [],
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

describe('extractChapterUpdates', () => {
  it('추출 API 호출 후 대기중(pending) 제안만 골라 스토어에 반영한다', async () => {
    mockExtract.mockResolvedValue({
      candidateEntities: [],
      attributeChanges: [],
      timelineChanges: [],
    });
    mockList.mockResolvedValue([
      {
        id: 's1',
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        kind: 'new_entity',
        payload: { name: '신규 인물', summary: '요약' },
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 's2',
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        kind: 'attribute_change',
        payload: { entityId: 'e1', attribute: '외모', newValue: '흉터' },
        status: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    await useWorksStore.getState().extractChapterUpdates(WORK_ID, CHAPTER_ID);

    expect(mockExtract).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: CHAPTER_ID },
    });
    expect(mockList).toHaveBeenCalledWith({ path: { work_id: WORK_ID, chapter_id: CHAPTER_ID } });
    expect(getChapter().pendingSuggestions).toEqual([
      { id: 's1', kind: 'new_entity', payload: { name: '신규 인물', summary: '요약' } },
    ]);
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockExtract.mockRejectedValue(new Error('network error'));

    await expect(
      useWorksStore.getState().extractChapterUpdates(WORK_ID, CHAPTER_ID)
    ).rejects.toThrow('network error');
    expect(getChapter().pendingSuggestions).toBeUndefined();
  });
});

describe('acceptSuggestion', () => {
  it('실 API로 승인하고 성공 시 대기 목록에서 제거한다', async () => {
    useWorksStore.setState((state) => {
      const chapter = state.works[0].chapters[0];
      chapter.pendingSuggestions = [
        { id: 's1', kind: 'new_entity', payload: { name: '신규 인물' } },
        { id: 's2', kind: 'new_entity', payload: { name: '다른 인물' } },
      ];
    });
    mockApprove.mockResolvedValue({});

    await useWorksStore.getState().acceptSuggestion(WORK_ID, CHAPTER_ID, 's1');

    expect(mockApprove).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: CHAPTER_ID, suggestion_id: 's1' },
    });
    expect(getChapter().pendingSuggestions).toEqual([
      { id: 's2', kind: 'new_entity', payload: { name: '다른 인물' } },
    ]);
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    useWorksStore.setState((state) => {
      state.works[0].chapters[0].pendingSuggestions = [
        { id: 's1', kind: 'new_entity', payload: { name: '신규 인물' } },
      ];
    });
    mockApprove.mockRejectedValue(new Error('conflict'));

    await expect(
      useWorksStore.getState().acceptSuggestion(WORK_ID, CHAPTER_ID, 's1')
    ).rejects.toThrow('conflict');
    expect(getChapter().pendingSuggestions).toHaveLength(1);
  });
});

describe('dismissSuggestion', () => {
  it('실 API로 거절하고 성공 시 대기 목록에서 제거한다', async () => {
    useWorksStore.setState((state) => {
      state.works[0].chapters[0].pendingSuggestions = [
        { id: 's1', kind: 'new_entity', payload: { name: '신규 인물' } },
      ];
    });
    mockReject.mockResolvedValue({});

    await useWorksStore.getState().dismissSuggestion(WORK_ID, CHAPTER_ID, 's1');

    expect(mockReject).toHaveBeenCalledWith({
      path: { work_id: WORK_ID, chapter_id: CHAPTER_ID, suggestion_id: 's1' },
    });
    expect(getChapter().pendingSuggestions).toEqual([]);
  });
});
