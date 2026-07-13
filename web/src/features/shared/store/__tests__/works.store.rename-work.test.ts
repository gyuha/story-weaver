import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../../types';
import { useWorksStore } from '../works.store';

const mockUpdateWork = vi.fn();

vi.mock('@/features/works/api/works.api', () => ({
  worksApi: {
    update: (...args: unknown[]) => mockUpdateWork(...args),
  },
}));

function makeWork(overrides: Partial<Work> & { id: string }): Work {
  return {
    title: '원래 제목',
    shortLabel: '원',
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

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [makeWork({ id: WORK_ID })] });
});

describe('renameWork', () => {
  it('실 API로 작품 제목을 수정하고 성공 시 스토어에 반영한다', async () => {
    mockUpdateWork.mockResolvedValue({ id: WORK_ID, title: '새 제목' });

    await useWorksStore.getState().renameWork(WORK_ID, '새 제목');

    expect(mockUpdateWork).toHaveBeenCalledWith({
      path: { work_id: WORK_ID },
      body: { title: '새 제목' },
    });
    expect(useWorksStore.getState().works[0].title).toBe('새 제목');
  });

  it('실패 시 스토어를 바꾸지 않고 에러를 던진다', async () => {
    mockUpdateWork.mockRejectedValue(new Error('network error'));

    await expect(useWorksStore.getState().renameWork(WORK_ID, '새 제목')).rejects.toThrow();
    expect(useWorksStore.getState().works[0].title).toBe('원래 제목');
  });
});
