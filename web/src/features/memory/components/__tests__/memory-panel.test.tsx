import type { Chapter, Work } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

const mockSearch = vi.fn();
vi.mock('@/features/memory/api/memory.api', () => ({
  memoryApi: { search: (...args: unknown[]) => mockSearch(...args) },
}));

const mockGetMessages = vi.fn();
const mockStartNewConversationMutationFn = vi.fn();
const chatStartSpy = vi.fn();
interface MockChatStreamState {
  text: string;
  isStreaming: boolean;
  error: Error | null;
}
let setMockChatStreamState: (patch: Partial<MockChatStreamState>) => void = () => {};

vi.mock('@/features/memory/api/chat.api', () => ({
  chatQueries: {
    conversation: (options: unknown) => ({
      queryKey: ['chat-conversation-test', options],
      queryFn: () => Promise.resolve(null),
    }),
    messages: (options: unknown) => ({
      queryKey: ['chat-messages-test', options],
      queryFn: () => mockGetMessages(options),
    }),
  },
  chatMutations: {
    startNewConversation: () => ({
      mutationFn: (options: unknown) => mockStartNewConversationMutationFn(options),
    }),
  },
  useChatStream: () => {
    const [state, setState] = useState<MockChatStreamState>({
      text: '',
      isStreaming: false,
      error: null,
    });
    setMockChatStreamState = (patch) => setState((s) => ({ ...s, ...patch }));
    return { start: chatStartSpy, ...state };
  },
}));

const mockAcceptSuggestion = vi.fn();
const mockDismissSuggestion = vi.fn();
const mockRemoveChapterEntityLink = vi.fn();
const mockAddChapterEntityLinks = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (
    selector: (s: {
      acceptSuggestion: typeof mockAcceptSuggestion;
      dismissSuggestion: typeof mockDismissSuggestion;
      removeChapterEntityLink: typeof mockRemoveChapterEntityLink;
      addChapterEntityLinks: typeof mockAddChapterEntityLinks;
    }) => unknown
  ) =>
    selector({
      acceptSuggestion: mockAcceptSuggestion,
      dismissSuggestion: mockDismissSuggestion,
      removeChapterEntityLink: mockRemoveChapterEntityLink,
      addChapterEntityLinks: mockAddChapterEntityLinks,
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
  status: 'draft',
  paragraphs: [{ text: '본문' }],
  linkedEntityIds: [],
  vectorMemory: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  setMockChatStreamState = () => {};
});

describe('MemoryPanel · AI 동적 업데이트 제안', () => {
  it('kind별로 대기중 제안을 카드로 보여준다', () => {
    const chapter: Chapter = {
      ...CHAPTER,
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

    render(<MemoryPanel work={WORK} chapter={chapter} />);

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
    const chapter: Chapter = {
      ...CHAPTER,
      pendingSuggestions: [{ id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객' } }],
    };

    render(<MemoryPanel work={WORK} chapter={chapter} />);
    await userEvent.click(screen.getByRole('button', { name: '반영' }));

    expect(mockAcceptSuggestion).toHaveBeenCalledWith('w1', 'ch1', 's1');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('반영이 실패하면 에러 토스트를 보여준다', async () => {
    mockAcceptSuggestion.mockRejectedValue(new Error('conflict'));
    const chapter: Chapter = {
      ...CHAPTER,
      pendingSuggestions: [{ id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객' } }],
    };

    render(<MemoryPanel work={WORK} chapter={chapter} />);
    await userEvent.click(screen.getByRole('button', { name: '반영' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('무시 클릭 시 실 API(dismissSuggestion)를 제안 id와 함께 호출한다', async () => {
    mockDismissSuggestion.mockResolvedValue(undefined);
    const chapter: Chapter = {
      ...CHAPTER,
      pendingSuggestions: [{ id: 's1', kind: 'new_entity', payload: { name: '떠돌이 검객' } }],
    };

    render(<MemoryPanel work={WORK} chapter={chapter} />);
    await userEvent.click(screen.getByRole('button', { name: '무시' }));

    expect(mockDismissSuggestion).toHaveBeenCalledWith('w1', 'ch1', 's1');
  });
});

async function openRecommend() {
  render(<MemoryPanel work={WORK} chapter={CHAPTER} />);
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

    expect(mockSearch).toHaveBeenCalledWith({ path: { work_id: 'w1', chapter_id: 'ch1' } });
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

async function renderChatTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryPanel work={WORK} chapter={CHAPTER} />
    </QueryClientProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: '채팅' }));
}

describe('MemoryPanel · ChatTab', () => {
  it('마운트 시 작품의 대화 이력을 조회한다', async () => {
    mockGetMessages.mockResolvedValue([]);

    await renderChatTab();

    await waitFor(() => {
      expect(mockGetMessages).toHaveBeenCalledWith({ path: { work_id: 'w1' } });
    });
  });

  it('이력이 있으면 말풍선으로 복원한다', async () => {
    mockGetMessages.mockResolvedValue([
      { id: 'm1', conversationId: 'c1', role: 'user', content: '주인공 나이가 몇살이야?' },
      { id: 'm2', conversationId: 'c1', role: 'assistant', content: '17세입니다' },
    ]);

    await renderChatTab();

    await waitFor(() => {
      expect(screen.getByText('주인공 나이가 몇살이야?')).toBeInTheDocument();
    });
    expect(screen.getByText('17세입니다')).toBeInTheDocument();
  });

  it('전송 시 실 API를 호출하고 스트리밍 텍스트를 점진적으로 반영한다', async () => {
    mockGetMessages.mockResolvedValue([]);
    await renderChatTab();

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요…');
    await userEvent.type(textarea, '주인공 이름이 뭐야?');
    await userEvent.click(screen.getByRole('button', { name: '전송' }));

    expect(chatStartSpy).toHaveBeenCalledWith({
      workId: 'w1',
      payload: { content: '주인공 이름이 뭐야?', chapterId: 'ch1' },
    });

    act(() => setMockChatStreamState({ isStreaming: true, text: '이름은' }));
    expect(screen.getByText('이름은')).toBeInTheDocument();

    act(() => setMockChatStreamState({ isStreaming: false, text: '이름은 담천입니다' }));
    await waitFor(() => {
      expect(screen.getByText('이름은 담천입니다')).toBeInTheDocument();
    });
  });

  it('스트리밍 중에는 입력·전송이 비활성화된다', async () => {
    mockGetMessages.mockResolvedValue([]);
    await renderChatTab();

    act(() => setMockChatStreamState({ isStreaming: true, text: '' }));

    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeDisabled();
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
  });

  it("'새 대화' 클릭 시 생성 API를 호출하고 말풍선을 초기화한다", async () => {
    mockGetMessages.mockResolvedValue([
      { id: 'm1', conversationId: 'c1', role: 'user', content: '이전 대화' },
    ]);
    mockStartNewConversationMutationFn.mockResolvedValue({ id: 'c2' });

    await renderChatTab();
    await waitFor(() => expect(screen.getByText('이전 대화')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '새 대화' }));

    expect(mockStartNewConversationMutationFn).toHaveBeenCalledWith({
      path: { work_id: 'w1' },
    });
    await waitFor(() => {
      expect(screen.queryByText('이전 대화')).not.toBeInTheDocument();
    });
  });

  it('스트림 에러가 발생하면 에러 토스트를 보여준다', async () => {
    mockGetMessages.mockResolvedValue([]);
    await renderChatTab();

    act(() => setMockChatStreamState({ isStreaming: false, error: new Error('network error') }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
