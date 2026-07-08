import type { Chapter, Scene, Work } from '@/features/shared/types';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

const mockSearch = vi.fn();
vi.mock('@/features/memory/api/memory.api', () => ({
  memoryApi: { search: (...args: unknown[]) => mockSearch(...args) },
}));

const mockAcceptSuggestion = vi.fn();
const mockDismissSuggestion = vi.fn();
const mockRemoveSceneEntityLink = vi.fn();
const mockAddSceneEntityLinks = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (
    selector: (s: {
      acceptSuggestion: typeof mockAcceptSuggestion;
      dismissSuggestion: typeof mockDismissSuggestion;
      removeSceneEntityLink: typeof mockRemoveSceneEntityLink;
      addSceneEntityLinks: typeof mockAddSceneEntityLinks;
    }) => unknown
  ) =>
    selector({
      acceptSuggestion: mockAcceptSuggestion,
      dismissSuggestion: mockDismissSuggestion,
      removeSceneEntityLink: mockRemoveSceneEntityLink,
      addSceneEntityLinks: mockAddSceneEntityLinks,
    }),
}));

vi.mock('sonner', () => {
  const toast = vi.fn() as unknown as {
    (message: string): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { toast };
});

import { toast } from 'sonner';
import { MemoryPanel } from '../memory-panel';

const WORK: Work = {
  id: 'w1',
  title: '천뢰검전',
  shortLabel: '천',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  status: '연재 중',
  coverTheme: 'dark',
  stats: { chapters: 0, words: '0', wordsUnit: '만자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [],
  entities: [
    { id: 'e2', type: '인물', name: '조력자', emoji: '👤', summary: '조력자 요약', fields: [] },
    {
      id: 'e3',
      type: '인물',
      name: '숨은 인물',
      emoji: '👤',
      summary: '벡터로 발견됨',
      fields: [],
    },
  ],
  timeline: [],
  conflicts: [],
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

const CHAPTER: Chapter = {
  id: 'ch1',
  episodeId: 'ep1',
  partLabel: '제1부',
  index: 1,
  title: '1화',
  scenes: [],
};

const SCENE: Scene = {
  id: 'sc1',
  title: '새 씬',
  status: 'draft',
  paragraphs: [{ text: '본문' }],
  linkedEntityIds: [],
  vectorMemory: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MemoryPanel · AI 동적 업데이트 제안', () => {
  it('kind별로 대기중 제안을 카드로 보여준다', () => {
    const scene: Scene = {
      ...SCENE,
      pendingSuggestions: [
        { id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객', summary: '신비한 인물' } },
        {
          id: 's2',
          kind: 'attribute_change',
          payload: { entityId: 'e2', attribute: '외모', newValue: '흉터' },
        },
        {
          id: 's3',
          kind: 'timeline_state',
          payload: { entityId: 'e2', stateKey: 'life_status', stateValue: 'dead' },
        },
      ],
    };

    render(<MemoryPanel work={WORK} chapter={CHAPTER} scene={scene} />);

    expect(screen.getByText(/떠돌이 검객/)).toBeInTheDocument();
    expect(screen.getByText(/신비한 인물/)).toBeInTheDocument();
    expect(screen.getByText(/흉터/)).toBeInTheDocument();
    expect(screen.getByText(/dead/)).toBeInTheDocument();
    // attribute_change/timeline_state는 entityId로 기존 엔티티 이름을 찾아 보여준다.
    expect(screen.getAllByText(/조력자/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '반영' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: '무시' })).toHaveLength(3);
  });

  it('반영 클릭 시 실 API(acceptSuggestion)를 제안 id와 함께 호출하고 성공 토스트를 보여준다', async () => {
    mockAcceptSuggestion.mockResolvedValue(undefined);
    const scene: Scene = {
      ...SCENE,
      pendingSuggestions: [{ id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객' } }],
    };

    render(<MemoryPanel work={WORK} chapter={CHAPTER} scene={scene} />);
    await userEvent.click(screen.getByRole('button', { name: '반영' }));

    expect(mockAcceptSuggestion).toHaveBeenCalledWith('w1', 'sc1', 's1');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('반영이 실패하면 에러 토스트를 보여준다', async () => {
    mockAcceptSuggestion.mockRejectedValue(new Error('conflict'));
    const scene: Scene = {
      ...SCENE,
      pendingSuggestions: [{ id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객' } }],
    };

    render(<MemoryPanel work={WORK} chapter={CHAPTER} scene={scene} />);
    await userEvent.click(screen.getByRole('button', { name: '반영' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('무시 클릭 시 실 API(dismissSuggestion)를 제안 id와 함께 호출한다', async () => {
    mockDismissSuggestion.mockResolvedValue(undefined);
    const scene: Scene = {
      ...SCENE,
      pendingSuggestions: [{ id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객' } }],
    };

    render(<MemoryPanel work={WORK} chapter={CHAPTER} scene={scene} />);
    await userEvent.click(screen.getByRole('button', { name: '무시' }));

    expect(mockDismissSuggestion).toHaveBeenCalledWith('w1', 'sc1', 's1');
  });
});

async function openRecommend() {
  render(<MemoryPanel work={WORK} chapter={CHAPTER} scene={SCENE} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 추천 받기' }));
}

describe('MemoryPanel · AI 추천 받기', () => {
  it('조회 중에는 버튼이 비활성화되고 로딩 문구를 보여준다', async () => {
    let resolveSearch: (v: unknown[]) => void = () => {};
    mockSearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );

    await openRecommend();

    const button = screen.getByRole('button', { name: 'AI 추천 가져오는 중…' });
    expect(button).toBeDisabled();

    resolveSearch([]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AI 추천 받기' })).not.toBeDisabled();
    });
  });

  it('조회가 실패하면 에러 토스트를 보여준다', async () => {
    mockSearch.mockRejectedValue(new Error('network error'));

    await openRecommend();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('type=entity/timeline_state는 링크 배지로, type=vector_match는 추천 배지로 표시한다', async () => {
    mockSearch.mockResolvedValue([
      { type: 'entity', priority: 1, entityId: 'e2', name: '조력자', summary: '조력자 요약' },
      {
        type: 'vector_match',
        priority: 3,
        entityId: 'e3',
        sourceType: 'entity',
        sourceId: 'e3',
        content: '숨은 인물 언급',
      },
    ]);

    await openRecommend();

    await waitFor(() => {
      expect(screen.getByText('조력자')).toBeInTheDocument();
    });

    const linkCard = screen.getByText('조력자').closest('button') as HTMLElement;
    expect(within(linkCard).getByText('링크')).toBeInTheDocument();

    const vectorCard = screen.getByText('숨은 인물').closest('button') as HTMLElement;
    expect(within(vectorCard).getByText('추천')).toBeInTheDocument();

    expect(mockSearch).toHaveBeenCalledWith({ path: { work_id: 'w1', scene_id: 'sc1' } });
    expect(toast.success).toHaveBeenCalled();
  });

  it('추천할 새 항목이 없으면 안내 토스트를 보여준다', async () => {
    mockSearch.mockResolvedValue([]);

    await openRecommend();

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('추천할 설정이 없습니다');
    });
  });
});
