import type { Chapter, Work } from '@/features/shared/types';
import { act, render, screen, waitFor } from '@testing-library/react';
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
const mockRestoreChapterVersion = vi.fn();
const mockExtractChapterUpdates = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (
    selector: (s: {
      renameChapter: typeof mockRenameChapter;
      restoreChapterVersion: typeof mockRestoreChapterVersion;
      setChapterParagraphs: typeof mockSetChapterParagraphs;
      extractChapterUpdates: typeof mockExtractChapterUpdates;
    }) => unknown
  ) =>
    selector({
      renameChapter: mockRenameChapter,
      restoreChapterVersion: mockRestoreChapterVersion,
      setChapterParagraphs: mockSetChapterParagraphs,
      extractChapterUpdates: mockExtractChapterUpdates,
    }),
}));

vi.mock('../selection-ai-menu', () => ({ SelectionAiMenu: () => null }));

const startSpy = vi.fn();
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
    return { start: startSpy, ...state };
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
    useEditor: () => fakeEditor,
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
  setMockAssistState = () => {};
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

  it('스트림 청크가 도착하는 대로 제안이 점진적으로 반영된다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '그녀는' }));
    expect(screen.getByText('그녀는')).toBeInTheDocument();

    act(() => setMockAssistState({ text: '그녀는 돌아섰다' }));
    expect(screen.getByText('그녀는 돌아섰다')).toBeInTheDocument();
    expect(screen.queryByText('그녀는')).not.toBeInTheDocument();
  });

  it('적용 클릭 시 스트리밍된 텍스트를 에디터에 삽입한다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: false, text: '완성된 이어쓰기 문장' }));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(mockInsertContent).toHaveBeenCalledWith('완성된 이어쓰기 문장');
  });

  it('스트림 에러가 발생해도 에디터가 죽지 않고 에러 메시지를 보여준다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: false, error: new Error('LLM provider error') }));

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
    // 에러가 나도 나머지 에디터 UI는 정상 렌더된다 (크래시하지 않음)
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('이어쓰기 패널은 본문 에디터 컨테이너보다 DOM 순서상 뒤에 렌더된다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    const editorContainer = screen.getByTestId('editor-container');
    const cancelButton = screen.getByRole('button', { name: '취소' });

    const position = editorContainer.compareDocumentPosition(cancelButton);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('패널이 나타나면 화면에 보이도록 스크롤한다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
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

  it('생성 중에는 버튼이 비활성화된다', async () => {
    mockGetText.mockReturnValue('비 오는 골목, 그는 우산도 없이 서 있었다.');

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 제목 생성' }));

    expect(screen.getByRole('button', { name: 'AI 제목 생성' })).toBeDisabled();
  });
});
