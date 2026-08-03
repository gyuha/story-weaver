import type { Chapter, Work } from '@/features/shared/types';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
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
const mockRestoreChapterVersion = vi.fn();
const mockExtractChapterUpdates = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (
    selector: (s: {
      renameChapter: typeof mockRenameChapter;
      saveChapterSummary: typeof mockSaveChapterSummary;
      restoreChapterVersion: typeof mockRestoreChapterVersion;
      setChapterParagraphs: typeof mockSetChapterParagraphs;
      extractChapterUpdates: typeof mockExtractChapterUpdates;
    }) => unknown
  ) =>
    selector({
      renameChapter: mockRenameChapter,
      saveChapterSummary: mockSaveChapterSummary,
      restoreChapterVersion: mockRestoreChapterVersion,
      setChapterParagraphs: mockSetChapterParagraphs,
      extractChapterUpdates: mockExtractChapterUpdates,
    }),
}));

vi.mock('../selection-ai-menu', () => ({ SelectionAiMenu: () => null }));

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

describe('ManuscriptEditor 화 이탈 시 자동 저장', () => {
  // editor-screen이 key={chapter.id}로 화마다 새로 마운트하므로, 언마운트 정리가
  // 트리에서 다른 화 클릭·새 화 추가·읽기 모드 전환 등 모든 이탈 경로를 덮는다.

  const edit = (text: string) => {
    mockGetText.mockReturnValue(text);
    act(() => capturedOnUpdate.current?.({ editor: { getText: mockGetText } }));
  };

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
  it('요약 클릭 시 생성하지 않고 모달만 연다 — 저장된 요약을 먼저 보여준다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '이미 있는 요약.' }} />);

    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('이미 있는 요약.')).toBeInTheDocument();
    // 열자마자 토큰을 태우지 않는다 — 기존 요약만 보고 닫는 것이 흔한 경우다.
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('다시 요약을 누를 때 비로소 summary 태스크로 현재 본문을 보낸다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '이미 있는 요약.' }} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    await userEvent.click(screen.getByRole('button', { name: '다시 요약' }));

    expect(startSpy).toHaveBeenCalledWith('summary', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '그는 10년 전으로 돌아왔다.' },
    });
  });

  it('저장된 요약이 없으면 모달의 요약 버튼으로 생성한다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    // 저장된 요약이 없으므로 라벨이 '요약'이고 본문 자리는 비어 있다.
    expect(screen.getByTestId('summary-body').textContent).toBe('');
    const buttons = screen.getAllByRole('button', { name: '요약' });
    await userEvent.click(buttons[buttons.length - 1]);

    expect(startSpy).toHaveBeenCalledWith('summary', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: '그는 10년 전으로 돌아왔다.' },
    });
  });

  it('생성이 끝난 뒤 적용을 누르면 요약만 저장한다 — 본문은 보내지 않는다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));
    const buttons = screen.getAllByRole('button', { name: '요약' });
    await userEvent.click(buttons[buttons.length - 1]);

    act(() => setMockAssistState({ isStreaming: true, text: '' }));
    act(() => setMockAssistState({ isStreaming: false, text: '주인공이 회귀했다.' }));

    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(mockSaveChapterSummary).toHaveBeenCalledWith('w1', 'ch1', '주인공이 회귀했다.');
    expect(mockUpdateChapter).not.toHaveBeenCalled();
  });

  it('생성 후 닫기를 누르면 저장하지 않고 스트림을 끊는다', async () => {
    mockGetText.mockReturnValue('그는 10년 전으로 돌아왔다.');
    render(<ManuscriptEditor work={WORK} chapter={{ ...CHAPTER, summary: '이미 있는 요약.' }} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));
    await userEvent.click(screen.getByRole('button', { name: '다시 요약' }));
    act(() => setMockAssistState({ isStreaming: true, text: '주인공이' }));

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(mockSaveChapterSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('본문이 비어 있으면 생성하지 않고 안내한다 — 모달은 열려 있다', async () => {
    mockGetText.mockReturnValue('   ');
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: '요약' }));

    const buttons = screen.getAllByRole('button', { name: '요약' });
    await userEvent.click(buttons[buttons.length - 1]);

    expect(startSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
