import type { ChapterVersionDetailResponse, ChapterVersionListItem } from '@/api';
import type { Chapter, Work } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ workId: 'w1', chapterId: 'ch1' }),
    Link: ({ children, className }: { children: ReactNode; className?: string }) => (
      <span className={className}>{children}</span>
    ),
  };
});

// version-history-modal.test.tsx와 동일 패턴 — manuscriptQueries 팩토리를 {queryKey, queryFn}로
// 바꿔 스파이가 응답을 결정하게 한다. updateChapter는 되돌리기 PATCH를 세기 위한 스파이다.
const mockGetVersions = vi.fn();
const mockGetVersion = vi.fn();
const mockUpdateChapter = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptApi: { updateChapter: (...args: unknown[]) => mockUpdateChapter(...args) },
  manuscriptQueries: {
    chapterVersions: (options: unknown) => ({
      queryKey: ['chapter-versions-test', options],
      queryFn: () => mockGetVersions(options),
    }),
    chapterVersion: (options: unknown) => ({
      queryKey: ['chapter-version-test', options],
      queryFn: () => mockGetVersion(options),
    }),
    chapterVersionsKey: (options: unknown) => ['chapter-versions-test', options],
  },
}));

const mockSetChapterParagraphs = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (selector: (s: { setChapterParagraphs: unknown }) => unknown) =>
    selector({ setChapterParagraphs: mockSetChapterParagraphs }),
}));

vi.mock('@/features/editor/lib/hydrate-chapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/editor/lib/hydrate-chapters')>();
  return { ...actual, useWorkChapters: () => ({ isPending: false, isError: false }) };
});

vi.mock('@/features/shared/store/selectors', () => ({
  useWork: () => WORK,
  findChapter: (_work: unknown, id: string) => (id === 'ch1' ? CHAPTER : undefined),
}));

// 실제 diff 렌더링은 이 슬라이스의 관심사가 아니다(1of2가 담당) — 가볍게 세운다.
vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
  DiffMethod: { WORDS: 'words' },
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
import { VersionsPage } from '../versions-page';

const CHAPTER: Chapter = {
  id: 'ch1',
  episodeId: 'ep1',
  partLabel: '제1부',
  index: 1,
  title: '1화',
  status: 'draft',
  paragraphs: [{ text: '현재 본문' }],
  linkedEntityIds: [],
  vectorMemory: [],
};

const WORK = {
  id: 'w1',
  title: '천뢰검전',
  chapters: [CHAPTER],
} as unknown as Work;

const CHAPTER_PATH = { work_id: 'w1', episode_id: 'ep1', chapter_id: 'ch1' };

function makeItem(overrides: Partial<ChapterVersionListItem>): ChapterVersionListItem {
  return {
    id: 'v-default',
    createdAt: '2026-08-05T14:32:00',
    charCount: 100,
    charDelta: null,
    hasSummary: false,
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<ChapterVersionDetailResponse>
): ChapterVersionDetailResponse {
  return {
    id: 'v-default',
    createdAt: '2026-08-05T14:32:00',
    body: '본문',
    summary: null,
    ...overrides,
  };
}

/** 지금 당장 resolve/reject하지 않는 프라미스 — 요청이 in-flight인 상태를 붙잡아 둔다. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VersionsPage />
    </QueryClientProvider>
  );
}

/** 목록이 로드돼 좌=v1(직전), 우=v2(최신)로 기본 선택된 상태를 기다린다. */
async function renderWithTwoVersions() {
  mockGetVersions.mockResolvedValue({
    items: [makeItem({ id: 'v2' }), makeItem({ id: 'v1' })],
    total: 2,
  });
  mockGetVersion.mockImplementation((options: { path: { version_id: string } }) =>
    Promise.resolve(
      makeDetail({
        id: options.path.version_id,
        body: options.path.version_id === 'v1' ? '되돌릴 옛 본문' : '최신 본문',
      })
    )
  );
  const rendered = renderPage();
  await waitFor(() => expect(screen.getByTestId('diff-viewer')).toBeInTheDocument());
  return rendered;
}

const revertButton = () => screen.getByRole('button', { name: '이 버전으로 되돌리기' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VersionsPage 되돌리기 (task #75 S2)', () => {
  it('좌(기준) 버전의 본문으로 PATCH를 한 번만 보낸다 — 선저장은 없다 (완성 기준 ①)', async () => {
    mockUpdateChapter.mockResolvedValue({});
    await renderWithTwoVersions();

    await userEvent.click(revertButton());

    await waitFor(() => expect(mockUpdateChapter).toHaveBeenCalledTimes(1));
    expect(mockUpdateChapter).toHaveBeenCalledWith({
      path: CHAPTER_PATH,
      body: { body: '되돌릴 옛 본문' },
    });
    // 되돌린 본문이 스토어에도 반영돼야 복귀한 집필 화면이 옛 본문을 보지 않는다.
    expect(mockSetChapterParagraphs).toHaveBeenCalledWith('w1', 'ch1', [
      { text: '되돌릴 옛 본문' },
    ]);
  });

  it('성공하면 집필 화면으로 돌아가고 성공 토스트를 띄운다 (완성 기준 ②)', async () => {
    mockUpdateChapter.mockResolvedValue({});
    await renderWithTwoVersions();

    await userEvent.click(revertButton());

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/works/$workId/write/$chapterId',
        params: { workId: 'w1', chapterId: 'ch1' },
      })
    );
    expect(toast.success).toHaveBeenCalledWith('이전 버전으로 되돌렸습니다');
  });

  it('실패하면 이동하지 않고 에러 토스트를 띄운다 (완성 기준 ③)', async () => {
    mockUpdateChapter.mockRejectedValue(new Error('boom'));
    await renderWithTwoVersions();

    await userEvent.click(revertButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetChapterParagraphs).not.toHaveBeenCalled();
  });

  it('진행 중에는 버튼이 disabled라 두 번 눌러도 PATCH가 한 번이다 (완성 기준 ④)', async () => {
    // 목이 부작용까지 재현해야 실제 경로가 검증된다 — in-flight 상태를 붙잡아 두 번째
    // 클릭이 실제로 막히는지 본다. resolve만 하는 목으로는 이 명제를 볼 수 없다.
    const patch = deferred<unknown>();
    mockUpdateChapter.mockReturnValue(patch.promise);
    await renderWithTwoVersions();

    await userEvent.click(revertButton());
    await waitFor(() => expect(revertButton()).toBeDisabled());
    await userEvent.click(revertButton());

    expect(mockUpdateChapter).toHaveBeenCalledTimes(1);

    patch.resolve({});
    await act(async () => {
      await patch.promise;
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });
});
