import type { Chapter, Work } from '@/features/shared/types';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({
      to,
      children,
      className,
    }: { to: string; children: ReactNode; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  };
});

const mockUpdateChapter = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: { updateChapter: (...args: unknown[]) => mockUpdateChapter(...args) },
}));

const mockSetChapterParagraphs = vi.fn();
const mockRenameChapter = vi.fn();
const mockSaveChapterSummary = vi.fn();
const mockExtractChapterUpdates = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (
    selector: (s: {
      renameChapter: typeof mockRenameChapter;
      saveChapterSummary: typeof mockSaveChapterSummary;
      setChapterParagraphs: typeof mockSetChapterParagraphs;
      extractChapterUpdates: typeof mockExtractChapterUpdates;
    }) => unknown
  ) =>
    selector({
      renameChapter: mockRenameChapter,
      saveChapterSummary: mockSaveChapterSummary,
      setChapterParagraphs: mockSetChapterParagraphs,
      extractChapterUpdates: mockExtractChapterUpdates,
    }),
}));

vi.mock('../selection-ai-menu', () => ({ SelectionAiMenu: () => null }));

// 대체 확인 다이얼로그는 목하지 않는다 — 요약·진행 모달과 같은 Base UI `Dialog`라
// 실제로 렌더되고, `확인`/`취소`를 직접 누르는 것이 진짜 경로다.

const startSpy = vi.fn();
const stopSpy = vi.fn();
interface MockAssistState {
  text: string;
  isStreaming: boolean;
  error: Error | null;
}
let setMockAssistState: (patch: Partial<MockAssistState>) => void = () => {};

vi.mock('@/features/editor/api/assist.api', () => ({
  useAssistStream: () => {
    const [state, setState] = useState<MockAssistState>({
      text: '',
      isStreaming: false,
      error: null,
    });
    setMockAssistState = (patch) => setState((s) => ({ ...s, ...patch }));
    return { start: startSpy, stop: stopSpy, ...state };
  },
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

const mockGetText = vi.fn((_opts?: unknown) => '');
const capturedOnUpdate: { current: null | ((p: { editor: unknown }) => void) } = {
  current: null,
};
const mockSetContent = vi.fn();
const mockInsertContent = vi.fn();
const mockTextBetween = vi.fn((_from?: number, _to?: number, _sep?: string) => '');
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  const chain: Record<string, () => typeof chain> & { run: () => void } = new Proxy(
    {} as Record<string, () => typeof chain> & { run: () => void },
    {
      get: (_target, prop) => {
        if (prop === 'run') return vi.fn();
        if (prop === 'insertContent') {
          return (...args: unknown[]) => {
            mockInsertContent(...args);
            return chain;
          };
        }
        return () => chain;
      },
    }
  );
  const fakeEditor = {
    getText: (opts?: unknown) => mockGetText(opts),
    chain: () => chain,
    can: () => ({ undo: () => false, redo: () => false }),
    isActive: () => false,
    commands: { setContent: (...args: unknown[]) => mockSetContent(...args) },
    state: {
      selection: { from: 42 },
      doc: {
        textBetween: (from?: number, to?: number, sep?: string) => mockTextBetween(from, to, sep),
      },
    },
  };
  return {
    ...actual,
    // 자동 저장 테스트가 편집을 흉내낼 수 있도록 onUpdate를 붙잡아 둔다.
    useEditor: (opts?: { onUpdate?: (p: { editor: unknown }) => void }) => {
      capturedOnUpdate.current = opts?.onUpdate ?? null;
      return fakeEditor;
    },
    useEditorState: ({ selector }: { selector: (arg: { editor: unknown }) => unknown }) =>
      selector({ editor: fakeEditor }),
    EditorContent: () => <div data-testid="editor-content" />,
  };
});

import { toast } from 'sonner';
import { ManuscriptEditor } from '../manuscript';

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
  entities: [],
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
  paragraphs: [{ text: '원래 문단' }],
  linkedEntityIds: [],
  vectorMemory: [],
};

const mockScrollIntoView = vi.fn();
Element.prototype.scrollIntoView = mockScrollIntoView;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetText.mockReturnValue('원래 문단');
  mockTextBetween.mockReturnValue('원래 문단');
  mockExtractChapterUpdates.mockResolvedValue(undefined);
  mockRenameChapter.mockResolvedValue(undefined);
  mockSaveChapterSummary.mockResolvedValue(undefined);
  setMockAssistState = () => {};
});

// 여러 describe에서 공유 — 실제 onUpdate 콜백을 통해 편집을 흉내낸다(mockGetText를 렌더
// 전에 미리 다른 값으로 세팅하는 방식은 마운트 시점 기준값도 그 값으로 잡혀버려
// 되돌리기의 "미저장 편집분" 시뮬레이션에 더 이상 쓸 수 없다 — task #73 되돌리기 회귀 수정).
const edit = (text: string) => {
  mockGetText.mockReturnValue(text);
  act(() => capturedOnUpdate.current?.({ editor: { getText: mockGetText } }));
};

describe('ManuscriptEditor 화 이탈 시 자동 저장', () => {
  // editor-screen이 key={chapter.id}로 화마다 새로 마운트하므로, 언마운트 정리가
  // 트리에서 다른 화 클릭·새 화 추가·읽기 모드 전환 등 모든 이탈 경로를 덮는다.

  it('편집한 뒤 화를 떠나면 자동으로 저장한다', async () => {
    mockUpdateChapter.mockResolvedValue({});
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    edit('원래 문단\n새로 쓴 문단');
    unmount();

    expect(mockUpdateChapter).toHaveBeenCalledWith({
      path: { work_id: 'w1', episode_id: 'ep1', chapter_id: 'ch1' },
      body: { body: '원래 문단\n새로 쓴 문단' },
    });
    await waitFor(() =>
      expect(mockSetChapterParagraphs).toHaveBeenCalledWith('w1', 'ch1', [
        { text: '원래 문단' },
        { text: '새로 쓴 문단' },
      ])
    );
  });

  it('편집하지 않고 떠나면 저장하지 않는다', () => {
    // StrictMode의 이중 마운트도 이 경로로 걸러진다.
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    unmount();
    expect(mockUpdateChapter).not.toHaveBeenCalled();
  });

  it('편집했다가 원래 내용으로 되돌려 놓고 떠나면 저장하지 않는다', () => {
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    edit('잠깐 바꿨다가');
    edit('원래 문단');
    unmount();

    expect(mockUpdateChapter).not.toHaveBeenCalled();
  });

  it('자동 저장 성공 토스트는 어느 화가 저장됐는지 밝힌다', async () => {
    // 이미 다른 화로 넘어간 뒤라 "저장했습니다"만으로는 무엇이 저장됐는지 알 수 없다.
    mockUpdateChapter.mockResolvedValue({});
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    edit('원래 문단\n새로 쓴 문단');
    unmount();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("'1화 1화' 저장했습니다"));
  });

  it('자동 저장은 설정 추출을 부르지 않는다', async () => {
    // 설정 추출은 LLM 호출이라 화를 옮길 때마다 사용량 한도를 먹는다.
    mockUpdateChapter.mockResolvedValue({});
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    edit('원래 문단\n새로 쓴 문단');
    unmount();

    await waitFor(() => expect(mockSetChapterParagraphs).toHaveBeenCalled());
    expect(mockExtractChapterUpdates).not.toHaveBeenCalled();
  });

  it('편집 없이 떠나면 성공 토스트도 뜨지 않는다', () => {
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    unmount();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('제목을 바꾼 뒤 떠나면 토스트가 바뀐 제목을 쓴다', async () => {
    // 언마운트 클로저는 마운트 시점 값을 붙잡으므로 ref로 최신 제목을 읽어야 한다.
    mockUpdateChapter.mockResolvedValue({});
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    const titleInput = screen.getByLabelText('챕터 제목');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '바뀐 제목');

    edit('원래 문단\n새로 쓴 문단');
    cleanup();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("'1화 바뀐 제목' 저장했습니다"));
  });

  it('자동 저장이 실패하면 어느 화가 실패했는지 토스트로 알린다', async () => {
    mockUpdateChapter.mockRejectedValue(new Error('boom'));
    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    edit('원래 문단\n새로 쓴 문단');
    unmount();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain('1화');
  });
});

describe('ManuscriptEditor 저장', () => {
  it('저장 클릭 시 편집한 본문으로 PATCH chapters/{id}를 호출한다', async () => {
    mockGetText.mockReturnValue('수정된 첫 문단\n수정된 둘째 문단');
    mockUpdateChapter.mockResolvedValue({});

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpdateChapter).toHaveBeenCalledWith({
      path: { work_id: 'w1', episode_id: 'ep1', chapter_id: 'ch1' },
      body: { body: '수정된 첫 문단\n수정된 둘째 문단' },
    });
    expect(mockSetChapterParagraphs).toHaveBeenCalledWith('w1', 'ch1', [
      { text: '수정된 첫 문단' },
      { text: '수정된 둘째 문단' },
    ]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('저장이 실패하면 에러를 표시하고 편집 중인 내용을 지우지 않는다', async () => {
    mockGetText.mockReturnValue('저장되지 않은 편집 내용');
    mockUpdateChapter.mockRejectedValue(new Error('network error'));

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(toast.error).toHaveBeenCalled();
    // 실패 시 로컬 캐시(스토어)나 에디터 내용을 되돌리지 않는다 — 사용자의 편집이 그대로 남는다.
    expect(mockSetChapterParagraphs).not.toHaveBeenCalled();
    expect(mockSetContent).not.toHaveBeenCalled();
    // 저장 자체가 실패했으므로 설정 추출도 시도하지 않는다.
    expect(mockExtractChapterUpdates).not.toHaveBeenCalled();
  });

  it('저장 성공 후 신규 설정 추출을 트리거한다', async () => {
    mockUpdateChapter.mockResolvedValue({});

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(mockExtractChapterUpdates).toHaveBeenCalledWith('w1', 'ch1');
    });
  });

  it('추출이 실패해도 저장 성공 자체는 그대로 두고 에러 토스트만 보여준다', async () => {
    mockUpdateChapter.mockResolvedValue({});
    mockExtractChapterUpdates.mockRejectedValue(new Error('extract failed'));

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalled();
  });
});

describe('ManuscriptEditor AI 이어쓰기', () => {
  it('클릭 시 커서 앞 본문을 cursorText로 실 continue 태스크를 호출한다', async () => {
    mockTextBetween.mockReturnValue('커서 앞까지의 본문');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(mockTextBetween).toHaveBeenCalledWith(0, 42, '\n');
    expect(startSpy).toHaveBeenCalledWith('continue', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { cursorText: '커서 앞까지의 본문' },
    });
  });

  it('커서 앞 텍스트가 비면(커서가 화 맨 앞) 화 전체 본문으로 폴백해 호출한다', async () => {
    mockTextBetween.mockReturnValue('');
    mockGetText.mockReturnValue('화 전체 본문');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(startSpy).toHaveBeenCalledWith('continue', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { cursorText: '화 전체 본문' },
    });
  });

  it('화 전체가 비어 있으면 호출하지 않고 안내 토스트를 보여준다', async () => {
    mockTextBetween.mockReturnValue('');
    mockGetText.mockReturnValue('');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(startSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('스트림 청크가 도착하는 대로 완성된 후보만 점진적으로 카드에 반영된다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    // JSONL은 개행이 곧 경계다 — 완결된 줄만 카드로 뜨고 마지막 미완결 줄은 아직 안 뜬다.
    act(() =>
      setMockAssistState({
        isStreaming: true,
        text: '{"text":"첫째 후보"}\n{"text":"아직 자라는 중',
      })
    );
    expect(screen.getByText('첫째 후보')).toBeInTheDocument();
    expect(screen.queryByText('아직 자라는 중')).not.toBeInTheDocument();

    // 다음 줄이 완결되면 둘째도 카드로 뜬다.
    act(() =>
      setMockAssistState({
        text: '{"text":"첫째 후보"}\n{"text":"둘째 후보"}\n{"text":"다시 자라는 중',
      })
    );
    expect(screen.getByText('둘째 후보')).toBeInTheDocument();
    expect(screen.queryByText('다시 자라는 중')).not.toBeInTheDocument();
  });

  it('적용 클릭 시 스트리밍된 텍스트를 에디터에 삽입하고 스트림을 중단한다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: false, text: '완성된 이어쓰기 문장' }));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(mockInsertContent).toHaveBeenCalledWith('완성된 이어쓰기 문장');
    expect(stopSpy).toHaveBeenCalled();
  });

  it('취소 클릭 시 스트림을 중단하고 모달을 닫는다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '1. 가\n2. 나' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('ESC로 닫으면 스트림을 중단한다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    await userEvent.keyboard('{Escape}');

    expect(stopSpy).toHaveBeenCalled();
  });

  it('모달이 열려 있는 동안 편집 영역은 접근성 트리에서 숨겨져 상호작용할 수 없다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);

    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장', hidden: true })).toBeInTheDocument();
  });

  it('스트림 에러가 발생해도 에디터가 죽지 않고 모달에 에러 메시지를 보여준다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: false, error: new Error('LLM provider error') }));

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
    // 에러가 나도 나머지 에디터 UI는 크래시하지 않고 DOM에 남아 있다(모달이 열려 있으니 접근성
    // 트리에서는 가려진 채).
    expect(screen.getByRole('button', { name: '저장', hidden: true })).toBeInTheDocument();
  });

  it('이어쓰기 패널은 본문 에디터 컨테이너보다 DOM 순서상 뒤에 렌더된다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    const editorContainer = screen.getByTestId('editor-container');
    const cancelButton = screen.getByRole('button', { name: '취소' });

    const position = editorContainer.compareDocumentPosition(cancelButton);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ManuscriptEditor AI 제목 생성', () => {
  it('본문이 비어 있으면 호출하지 않고 안내 토스트를 보여준다', async () => {
    mockGetText.mockReturnValue('');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 제목 생성' }));

    expect(startSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('클릭 시 현재 화 라이브 본문을 text로 title 태스크를 호출한다', async () => {
    mockGetText.mockReturnValue('비 오는 골목, 그는 우산도 없이 서 있었다.');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 제목 생성' }));

    expect(startSpy).toHaveBeenCalledWith('title', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '비 오는 골목, 그는 우산도 없이 서 있었다.' },
    });
  });

  it('생성 완료 시 첫 줄만·양끝 따옴표를 제거해 제목 입력란에 채운다', async () => {
    mockGetText.mockReturnValue('비 오는 골목, 그는 우산도 없이 서 있었다.');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 제목 생성' }));

    act(() => setMockAssistState({ isStreaming: true }));
    act(() => setMockAssistState({ isStreaming: false, text: '"빗속의 검"\n(부제는 무시)' }));

    const input = screen.getByRole('textbox', { name: '챕터 제목' });
    expect((input as HTMLInputElement).value).toBe('빗속의 검');
  });

  it('생성 완료 시 별도 blur 없이 화 제목을 저장한다', async () => {
    mockGetText.mockReturnValue('비 오는 골목, 그는 우산도 없이 서 있었다.');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 제목 생성' }));

    act(() => setMockAssistState({ isStreaming: true }));
    act(() => setMockAssistState({ isStreaming: false, text: '"빗속의 검"\n(부제는 무시)' }));

    await waitFor(() => expect(mockRenameChapter).toHaveBeenCalledWith('w1', 'ch1', '빗속의 검'));
  });

  it('생성 중에는 버튼이 비활성화된다', async () => {
    mockGetText.mockReturnValue('비 오는 골목, 그는 우산도 없이 서 있었다.');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 제목 생성' }));

    expect(screen.getByRole('button', { name: 'AI 제목 생성' })).toBeDisabled();
  });
});

describe('ManuscriptEditor 화 요약', () => {
  const box = () => screen.getByRole('textbox', { name: '화 요약' });

  it('요약 클릭 시 생성하지 않고 모달만 연다 — 저장된 요약이 편집란에 들어온다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '이미 있는 요약.' }} />);

    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(box()).toHaveValue('이미 있는 요약.');
    // 열자마자 토큰을 태우지 않는다 — 저장된 요약만 보고 닫는 것이 흔한 경우다.
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('AI 요약을 누를 때 비로소 summary 태스크로 현재 본문을 보낸다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '이미 있는 요약.' }} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    await userEvent.click(screen.getByRole('button', { name: 'AI로 본문 요약' }));

    expect(startSpy).toHaveBeenCalledWith('summary', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '그는 10년 전으로 돌아왔다.' },
    });
  });

  it('생성이 끝나면 결과가 편집란에 들어온다 (task #70 S2)', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));
    await userEvent.click(screen.getByRole('button', { name: 'AI로 본문 요약' }));

    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    act(() => setMockAssistState({ isStreaming: false, text: '주인공이 회귀했다.' }));

    expect(box()).toHaveValue('주인공이 회귀했다.');
  });

  it('생성 결과를 손본 뒤 저장하면 고친 내용이 저장된다 (task #70 S3)', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));
    await userEvent.click(screen.getByRole('button', { name: 'AI로 본문 요약' }));
    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    act(() => setMockAssistState({ isStreaming: false, text: '주인공이 회귀했다.' }));

    await userEvent.type(box(), ' 거울도 보았다.');
    await userEvent.click(screen.getByRole('button', { name: '요약 저장' }));

    expect(mockSaveChapterSummary).toHaveBeenCalledWith(
      'w1',
      'ch1',
      '주인공이 회귀했다. 거울도 보았다.'
    );
    // body를 함께 실으면 서버가 본문을 재임베딩한다(task #67 S2).
    expect(mockUpdateChapter).not.toHaveBeenCalled();
  });

  it('직접 고쳐 저장할 수 있다 — AI를 거치지 않아도 된다 (task #70 S1)', async () => {
    mockGetText.mockReturnValue('본문');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '원래 요약' }} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    await userEvent.clear(box());
    await userEvent.type(box(), '작가가 쓴 요약');
    await userEvent.click(screen.getByRole('button', { name: '요약 저장' }));

    expect(mockSaveChapterSummary).toHaveBeenCalledWith('w1', 'ch1', '작가가 쓴 요약');
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('닫기는 편집 내용을 저장하지 않고 스트림을 끊는다', async () => {
    mockGetText.mockReturnValue('본문');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '원래 요약' }} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));
    await userEvent.clear(box());
    await userEvent.type(box(), '버려질 편집');

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(mockSaveChapterSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('본문이 비어 있으면 생성하지 않고 안내한다 — 모달은 열려 있다', async () => {
    mockGetText.mockReturnValue('   ');
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    await userEvent.click(screen.getByRole('button', { name: 'AI로 본문 요약' }));

    expect(startSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('ManuscriptEditor 늘려쓰기', () => {
  const box = () => screen.getByRole('textbox', { name: '화 요약' });
  const openModal = async () => {
    await userEvent.click(screen.getByRole('button', { name: '요약' }));
  };
  /** `요약으로 본문 작성` → (원고가 있으면) 확인창까지 통과 */
  const clickDraft = async (confirm = true) => {
    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));
    const ok = screen.queryByRole('button', { name: '확인' });
    if (ok && confirm) await userEvent.click(ok);
    else if (ok) await userEvent.click(screen.getByRole('button', { name: '취소' }));
  };

  it('편집란이 비어 있으면 생성하지 않고 안내한다 (task #71 S2)', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await openModal();

    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));

    expect(startSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('본문이 비어 있으면 확인 없이 바로 생성한다 (task #71 S2)', async () => {
    mockGetText.mockReturnValue(''); // 빈 화
    render(
      <ManuscriptEditor
        work={WORK}
        chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.', paragraphs: [] }}
      />
    );
    await openModal();

    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));

    expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument();
    expect(startSpy).toHaveBeenCalledWith('draft', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '주인공이 회귀한다.' },
    });
  });

  it('생성 전에 편집란 요약을 먼저 저장한다 (task #71 S2)', async () => {
    mockGetText.mockReturnValue('');
    render(
      <ManuscriptEditor
        work={WORK}
        chapter={{ ...CHAPTER, summary: '원래 요약', paragraphs: [] }}
      />
    );
    await openModal();
    await userEvent.clear(box());
    await userEvent.type(box(), '손본 요약');

    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));

    expect(mockSaveChapterSummary).toHaveBeenCalledWith('w1', 'ch1', '손본 요약');
    expect(startSpy).toHaveBeenCalledWith('draft', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '손본 요약' },
    });
  });

  it('원고가 있으면 대체 확인을 거치고, 취소하면 생성하지 않는다 (task #71 S2)', async () => {
    // 취소인데 생성이 시작되면 토큰만 나간다.
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();

    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));

    expect(screen.getByText(/복구할 수 없습니다/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('대체를 확인하면 생성이 시작된다 (task #71 S2)', async () => {
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();

    await clickDraft();

    expect(startSpy).toHaveBeenCalledWith('draft', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '주인공이 회귀한다.' },
    });
  });

  it('생성이 끝나면 본문을 한 번에 반영하고 모달을 닫는다 (task #71 S3)', async () => {
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();
    await clickDraft();

    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    expect(mockSetContent).not.toHaveBeenCalled(); // 스트리밍 중엔 원고를 건드리지 않는다
    act(() => setMockAssistState({ isStreaming: false, text: '첫 문단\n둘째 문단' }));

    expect(mockSetContent).toHaveBeenCalledWith('<p>첫 문단</p><p>둘째 문단</p>');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('생성문의 특수문자를 escape한다 (task #71 S3)', async () => {
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();
    await clickDraft();

    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    act(() => setMockAssistState({ isStreaming: false, text: '<script>alert(1)</script>' }));

    const html = String(mockSetContent.mock.calls[0][0]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('확인창이 요약 모달과 같은 다이얼로그 시스템에 뜬다 (UAT 발견)', async () => {
    // `useModal`은 `Modal.Ground`(fixed z-50)가 stacking context를 만들어, 그 안의
    // z-index를 얼마로 줘도 Base UI 요약 모달(z-50, body 끝 포털) 위로 올라가지 못한다.
    // 그래서 확인창도 Base UI `Dialog`로 띄운다 — 같은 층에서 나중에 열린 쪽이 위다.
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();

    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));

    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    // 확인창이 요약 모달보다 **뒤에** 붙어야 위에 그려진다.
    const confirm = screen.getByText(/복구할 수 없습니다/).closest('[role="dialog"]');
    expect(dialogs.at(-1)).toBe(confirm);
  });

  it('확인하면 요약 모달이 닫히고 진행 다이얼로그가 뜬다 (UAT 발견)', async () => {
    // 프로그램적으로 open을 내릴 때 Dialog가 onOpenChange를 쏘면 onClose가 `stop()`을
    // 불러 **생성이 즉시 취소된다**. stopSpy 미호출 단정이 그 함정을 잡는다.
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();

    await clickDraft();

    expect(screen.queryByRole('textbox', { name: '화 요약' })).not.toBeInTheDocument();
    expect(screen.getByText('AI로 작성 중')).toBeInTheDocument();
    expect(startSpy).toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('작성이 완료되면 진행 다이얼로그가 닫힌다 (UAT 발견)', async () => {
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();
    await clickDraft();

    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    expect(screen.getByText('AI로 작성 중')).toBeInTheDocument();
    act(() => setMockAssistState({ isStreaming: false, text: '첫 문단' }));

    expect(screen.queryByText('AI로 작성 중')).not.toBeInTheDocument();
  });

  it('진행 다이얼로그의 중단은 스트림을 끊고 원고를 건드리지 않는다 (UAT 발견)', async () => {
    // 실제 `stop()`은 abort → `finally`에서 isStreaming을 false로 내린다. 즉 중단 뒤에
    // 완료 전이가 **실제로 발생**하므로, 플래그를 먼저 끄지 않으면 쓰다 만 생성물이 본문을 덮어쓴다.
    render(
      <ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '주인공이 회귀한다.' }} />
    );
    await openModal();
    await clickDraft();
    act(() => setMockAssistState({ isStreaming: true, text: '쓰다 만 문장' }));

    await userEvent.click(screen.getByRole('button', { name: '중단' }));
    act(() => setMockAssistState({ isStreaming: false })); // abort의 finally가 하는 일

    expect(stopSpy).toHaveBeenCalled();
    expect(mockSetContent).not.toHaveBeenCalled();
    expect(screen.queryByText('AI로 작성 중')).not.toBeInTheDocument();
  });

  it('AI 요약 완료가 본문을 덮어쓰지 않는다 — 전이 감지가 서로 간섭하지 않는다 (task #71 S3)', async () => {
    // 늘려쓰기와 요약이 스트림 전이 ref를 공유하면 요약 완료가 본문을 갈아끼운다.
    mockGetText.mockReturnValue('본문이 있다');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '원래 요약' }} />);
    await openModal();
    await userEvent.click(screen.getByRole('button', { name: 'AI로 본문 요약' }));

    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    act(() => setMockAssistState({ isStreaming: false, text: '새 요약문' }));

    expect(box()).toHaveValue('새 요약문');
    expect(mockSetContent).not.toHaveBeenCalled();
  });
});

describe('ManuscriptEditor 버전 기록 진입 (task #75 S1)', () => {
  const CHAPTER_PATH = { work_id: 'w1', episode_id: 'ep1', chapter_id: 'ch1' };
  const VERSIONS_NAV = {
    to: '/works/$workId/versions/$chapterId',
    params: { workId: 'w1', chapterId: 'ch1' },
  };

  const openVersions = async () => {
    await userEvent.click(screen.getByRole('button', { name: '버전 기록' }));
  };

  it('미저장 편집분이 있으면 저장을 한 번 하고 버전 기록 페이지로 이동한다 (완성 기준 ①)', async () => {
    mockUpdateChapter.mockResolvedValue({});

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    edit('원래 문단\n덧붙인 문장');
    await openVersions();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(VERSIONS_NAV));
    expect(mockUpdateChapter).toHaveBeenCalledTimes(1);
    expect(mockUpdateChapter).toHaveBeenCalledWith({
      path: CHAPTER_PATH,
      body: { body: '원래 문단\n덧붙인 문장' },
    });
    // 저장된 본문이 스토어에도 반영돼야 페이지가 최신 본문을 본다.
    expect(mockSetChapterParagraphs).toHaveBeenCalledWith('w1', 'ch1', [
      { text: '원래 문단' },
      { text: '덧붙인 문장' },
    ]);
  });

  it('저장이 실패하면 이동하지 않고 에디터를 건드리지 않으며 에러 토스트를 띄운다 (완성 기준 ②)', async () => {
    // 목이 부작용까지 흉내내야 실제 경로가 검증된다 — reject만이 아니라 navigate 미호출까지 본다.
    mockUpdateChapter.mockRejectedValue(new Error('boom'));

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    edit('원래 문단\n덧붙인 문장');
    await openVersions();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetContent).not.toHaveBeenCalled();
    expect(mockSetChapterParagraphs).not.toHaveBeenCalled();
  });

  it('미저장 편집분이 없으면 저장 없이 바로 이동한다 (완성 기준 ③)', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await openVersions();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(VERSIONS_NAV));
    expect(mockUpdateChapter).not.toHaveBeenCalled();
  });

  it('이동으로 언마운트돼도 자동 저장이 추가 PATCH를 쏘지 않는다 — 총 1회 (완성 기준 ④)', async () => {
    // 이 테스트가 보는 명제는 "initialBodyRef가 갱신됐다"가 아니라 "PATCH 호출이 총 1회다".
    // 전자는 다른 명제이고(#71의 zIndex 함정), 실제 위험은 언마운트 정리가 같은 본문을
    // 한 번 더 보내 버전이 두 개 쌓이는 것이다.
    mockUpdateChapter.mockResolvedValue({});

    const { unmount } = render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    edit('원래 문단\n덧붙인 문장');
    await openVersions();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // 라우터 이동은 이 컴포넌트를 언마운트한다(editor-screen이 key={chapter.id}로 마운트한다).
    await act(async () => {
      unmount();
    });

    expect(mockUpdateChapter).toHaveBeenCalledTimes(1);
  });
});
