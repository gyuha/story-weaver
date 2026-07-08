import type { Chapter, Scene, Work } from '@/features/shared/types';
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

const mockUpdateScene = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: { updateScene: (...args: unknown[]) => mockUpdateScene(...args) },
}));

const mockSetSceneParagraphs = vi.fn();
const mockRenameChapter = vi.fn();
const mockRestoreSceneVersion = vi.fn();
const mockExtractSceneUpdates = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (
    selector: (s: {
      renameChapter: typeof mockRenameChapter;
      restoreSceneVersion: typeof mockRestoreSceneVersion;
      setSceneParagraphs: typeof mockSetSceneParagraphs;
      extractSceneUpdates: typeof mockExtractSceneUpdates;
    }) => unknown
  ) =>
    selector({
      renameChapter: mockRenameChapter,
      restoreSceneVersion: mockRestoreSceneVersion,
      setSceneParagraphs: mockSetSceneParagraphs,
      extractSceneUpdates: mockExtractSceneUpdates,
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
  scenes: [],
};

const SCENE: Scene = {
  id: 'sc1',
  title: '새 씬',
  status: 'draft',
  paragraphs: [{ text: '원래 문단' }],
  linkedEntityIds: [],
  vectorMemory: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetText.mockReturnValue('원래 문단');
  mockTextBetween.mockReturnValue('원래 문단');
  mockExtractSceneUpdates.mockResolvedValue(undefined);
  setMockAssistState = () => {};
});

describe('ManuscriptEditor 저장', () => {
  it('저장 클릭 시 편집한 본문으로 PATCH scenes/{id}를 호출한다', async () => {
    mockGetText.mockReturnValue('수정된 첫 문단\n수정된 둘째 문단');
    mockUpdateScene.mockResolvedValue({});

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpdateScene).toHaveBeenCalledWith({
      path: { work_id: 'w1', episode_id: 'ep1', chapter_id: 'ch1', scene_id: 'sc1' },
      body: { body: '수정된 첫 문단\n수정된 둘째 문단' },
    });
    expect(mockSetSceneParagraphs).toHaveBeenCalledWith('w1', 'sc1', [
      { text: '수정된 첫 문단' },
      { text: '수정된 둘째 문단' },
    ]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('저장이 실패하면 에러를 표시하고 편집 중인 내용을 지우지 않는다', async () => {
    mockGetText.mockReturnValue('저장되지 않은 편집 내용');
    mockUpdateScene.mockRejectedValue(new Error('network error'));

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(toast.error).toHaveBeenCalled();
    // 실패 시 로컬 캐시(스토어)나 에디터 내용을 되돌리지 않는다 — 사용자의 편집이 그대로 남는다.
    expect(mockSetSceneParagraphs).not.toHaveBeenCalled();
    expect(mockSetContent).not.toHaveBeenCalled();
    // 저장 자체가 실패했으므로 설정 추출도 시도하지 않는다.
    expect(mockExtractSceneUpdates).not.toHaveBeenCalled();
  });

  it('저장 성공 후 신규 설정 추출을 트리거한다', async () => {
    mockUpdateScene.mockResolvedValue({});

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(mockExtractSceneUpdates).toHaveBeenCalledWith('w1', 'sc1');
    });
  });

  it('추출이 실패해도 저장 성공 자체는 그대로 두고 에러 토스트만 보여준다', async () => {
    mockUpdateScene.mockResolvedValue({});
    mockExtractSceneUpdates.mockRejectedValue(new Error('extract failed'));

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
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

    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    expect(mockTextBetween).toHaveBeenCalledWith(0, 42, '\n');
    expect(startSpy).toHaveBeenCalledWith('continue', {
      workId: 'w1',
      sceneId: 'sc1',
      payload: { cursorText: '커서 앞까지의 본문' },
    });
  });

  it('스트림 청크가 도착하는 대로 제안이 점진적으로 반영된다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '그녀는' }));
    expect(screen.getByText('그녀는')).toBeInTheDocument();

    act(() => setMockAssistState({ text: '그녀는 돌아섰다' }));
    expect(screen.getByText('그녀는 돌아섰다')).toBeInTheDocument();
    expect(screen.queryByText('그녀는')).not.toBeInTheDocument();
  });

  it('적용 클릭 시 스트리밍된 텍스트를 에디터에 삽입한다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: false, text: '완성된 이어쓰기 문장' }));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(mockInsertContent).toHaveBeenCalledWith('완성된 이어쓰기 문장');
  });

  it('스트림 에러가 발생해도 에디터가 죽지 않고 에러 메시지를 보여준다', async () => {
    render(<ManuscriptEditor work={WORK} chapter={CHAPTER} scene={SCENE} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 이어쓰기' }));

    act(() => setMockAssistState({ isStreaming: false, error: new Error('LLM provider error') }));

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    // 에러가 나도 나머지 에디터 UI는 정상 렌더된다 (크래시하지 않음)
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });
});
