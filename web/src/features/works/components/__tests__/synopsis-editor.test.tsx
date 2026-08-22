import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSynopsis = vi.fn();
const mockUpdateSynopsisMutationFn = vi.fn();

vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptQueries: {
    synopsis: (options: unknown) => ({
      queryKey: ['synopsis-test', options],
      queryFn: () => mockGetSynopsis(options),
    }),
  },
  manuscriptMutations: {
    updateSynopsis: () => ({
      mutationFn: (options: unknown) => mockUpdateSynopsisMutationFn(options),
    }),
  },
}));

const mockUpdateWork = vi.fn();
vi.mock('@/features/works/api/works.api', () => ({
  worksApi: { update: (...args: unknown[]) => mockUpdateWork(...args) },
}));

const continueStartSpy = vi.fn();
const continueStopSpy = vi.fn();
interface MockContinueState {
  text: string;
  isStreaming: boolean;
  error: Error | null;
}
let setMockContinueState: (patch: Partial<MockContinueState>) => void = () => {};

vi.mock('@/features/works/api/synopsis-continue.api', () => ({
  useSynopsisContinueStream: () => {
    const [state, setState] = useState<MockContinueState>({
      text: '',
      isStreaming: false,
      error: null,
    });
    setMockContinueState = (patch) => setState((s) => ({ ...s, ...patch }));
    return { start: continueStartSpy, stop: continueStopSpy, ...state };
  },
}));

import { SynopsisEditor } from '../synopsis-editor';

const WORK: Work = {
  id: 'w1',
  title: '원래 제목',
  shortLabel: '원',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  styleNote: null,
  status: '구상',
  coverTheme: 'dark',
  stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [],
  entities: [],
  timeline: [],
  conflicts: [],
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

function renderEditor(work: Work = WORK) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SynopsisEditor work={work} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [WORK] });
  setMockContinueState = () => {};
});

describe('SynopsisEditor', () => {
  it('마운트 시 기획의도를 조회해 채운다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '기존 기획의도' });

    renderEditor();

    await waitFor(() => {
      expect(screen.getByLabelText('기획의도')).toHaveValue('기존 기획의도');
    });
  });

  it('시놉시스가 아직 없으면(404 등) 빈 상태로 보여준다', async () => {
    mockGetSynopsis.mockRejectedValue(new Error('404'));

    renderEditor();

    await waitFor(() => {
      expect(screen.getByLabelText('기획의도')).toHaveValue('');
    });
  });

  it('제목 입력란에서 벗어나면(blur) 작품 제목을 실 API로 저장한다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });
    mockUpdateWork.mockResolvedValue({ id: 'w1', title: '새 제목' });

    renderEditor();
    const titleInput = screen.getByLabelText('작품 제목');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '새 제목');
    await userEvent.tab();

    expect(mockUpdateWork).toHaveBeenCalledWith({
      path: { work_id: 'w1' },
      body: { title: '새 제목' },
    });
  });

  it('기획의도는 입력란에서 벗어나는(blur) 것만으로는 저장되지 않는다 — 저장/취소 버튼으로만 확정한다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue(''));

    await userEvent.type(screen.getByLabelText('기획의도'), '아직 저장 안 됨');
    await userEvent.tab();

    expect(mockUpdateSynopsisMutationFn).not.toHaveBeenCalled();
  });

  it('명시적인 "저장" 버튼을 눌러야 기획의도를 저장한다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });
    mockUpdateSynopsisMutationFn.mockResolvedValue({ id: 's1', workId: 'w1', body: '버튼 저장' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue(''));

    await userEvent.type(screen.getByLabelText('기획의도'), '버튼 저장');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpdateSynopsisMutationFn).toHaveBeenCalledWith({
      path: { work_id: 'w1' },
      body: { body: '버튼 저장' },
    });
  });

  it('"취소" 버튼을 누르면 마지막 저장 상태로 되돌리고 저장을 호출하지 않는다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '저장된 값' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue('저장된 값'));

    const textarea = screen.getByLabelText('기획의도');
    await userEvent.type(textarea, ' - 아직 저장 안 한 수정');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(textarea).toHaveValue('저장된 값');
    expect(mockUpdateSynopsisMutationFn).not.toHaveBeenCalled();
  });

  it('기획의도가 비어 있으면 "AI 이어쓰기" 클릭 시 호출하지 않고 안내 토스트를 보여준다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue(''));
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(continueStartSpy).not.toHaveBeenCalled();
  });

  // 팝오버가 SuggestionPicker를 공유하므로 연출 통일(원문 blob 제거 + 스켈레톤)을 함께 물려받는다.
  it('기획의도가 있으면 "AI 이어쓰기" 클릭 시 스트림을 시작하고, 생성 중엔 원문 대신 스켈레톤을 보여준다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '이 작품은' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue('이 작품은'));
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(continueStartSpy).toHaveBeenCalledWith({
      workId: 'w1',
      payload: { text: '이 작품은' },
    });

    act(() => setMockContinueState({ isStreaming: true, text: '회귀한 무사의 이야기' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    });
    expect(screen.queryByText('회귀한 무사의 이야기')).not.toBeInTheDocument();

    // 완료되면 후보 카드로 나타난다(마커 없는 응답은 후보 1개).
    act(() => setMockContinueState({ isStreaming: false }));
    await waitFor(() => {
      expect(screen.getByText('회귀한 무사의 이야기')).toBeInTheDocument();
    });
  });

  it('AI 제안 "적용" 클릭 시 기획의도 끝에 이어붙이고 자동 저장하지 않는다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '이 작품은' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue('이 작품은'));
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));
    act(() => setMockContinueState({ isStreaming: false, text: ' 회귀한 무사의 이야기다.' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '적용' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(screen.getByLabelText('기획의도')).toHaveValue('이 작품은 회귀한 무사의 이야기다.');
    expect(mockUpdateSynopsisMutationFn).not.toHaveBeenCalled();
  });

  it('AI 제안 패널의 "취소" 클릭 시 기획의도를 바꾸지 않고 패널만 닫는다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '이 작품은' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue('이 작품은'));
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));
    act(() => setMockContinueState({ isStreaming: false, text: ' 이어지는 문장.' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByLabelText('기획의도')).toHaveValue('이 작품은');
    // 패널이 닫혀 저장/취소 버튼 행이 다시 보인다.
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('AI 제안 패널의 "취소"는 진행 중인 스트림도 중단한다 (task #65)', async () => {
    // 패널만 닫으면 SSE 생성이 끝까지 돌아 토큰이 계속 탄다. 편집기 이어쓰기
    // (manuscript.tsx의 dismissDraft)와 같은 순서로 stop()을 먼저 부른다.
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '이 작품은' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue('이 작품은'));
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));
    act(() => setMockContinueState({ isStreaming: true, text: '' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(continueStopSpy).toHaveBeenCalledTimes(1);
  });

  it('문체 지침 입력란이 렌더되고 작품에 저장된 값으로 채워진다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });

    renderEditor({ ...WORK, styleNote: '건조한 하드보일드, 3인칭 제한 시점' });

    await waitFor(() => {
      expect(screen.getByLabelText('문체 지침')).toHaveValue('건조한 하드보일드, 3인칭 제한 시점');
    });
  });

  it('문체 지침을 입력하고 저장하면 작품 수정 API가 1회 호출된다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });
    mockUpdateWork.mockResolvedValue({ id: 'w1', styleNote: '간결하게' });

    renderEditor();
    await waitFor(() => expect(screen.getByLabelText('기획의도')).toHaveValue(''));

    await userEvent.type(screen.getByLabelText('문체 지침'), '간결하게');
    await userEvent.click(screen.getByRole('button', { name: '문체 지침 저장' }));

    expect(mockUpdateWork).toHaveBeenCalledTimes(1);
    expect(mockUpdateWork).toHaveBeenCalledWith({
      path: { work_id: 'w1' },
      body: { styleNote: '간결하게' },
    });
  });

  it('문체 지침 "취소"를 누르면 마지막 저장 상태로 되돌리고 저장 API를 호출하지 않는다', async () => {
    mockGetSynopsis.mockResolvedValue({ id: 's1', workId: 'w1', body: '' });

    renderEditor({ ...WORK, styleNote: '원래 지침' });
    await waitFor(() => expect(screen.getByLabelText('문체 지침')).toHaveValue('원래 지침'));

    const textarea = screen.getByLabelText('문체 지침');
    await userEvent.type(textarea, ' 추가');
    await userEvent.click(screen.getByRole('button', { name: '문체 지침 취소' }));

    expect(textarea).toHaveValue('원래 지침');
    expect(mockUpdateWork).not.toHaveBeenCalled();
  });
});
