import type { ChapterVersionDetailResponse, ChapterVersionListItem } from '@/api';
import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 이 파일은 react-diff-viewer-continued를 목으로 대체하지 않는다 — 완료 기준 ②(한 어절만
// 바뀐 입력에서 변경 행이 하나만 나온다)는 실제 diff 렌더 결과를 봐야 한다. props 전달
// 자체는 $chapterId.test.tsx(완료 기준 ①·③)에서 목으로 검증한다.
const mockUseParams = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => mockUseParams(),
    Link: ({
      to,
      children,
      ...props
    }: { to: string; children: React.ReactNode } & Record<string, unknown>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

const mockUseWorkChapters = vi.fn();
vi.mock('@/features/editor/lib/hydrate-chapters', () => ({
  useWorkChapters: (...args: unknown[]) => mockUseWorkChapters(...args),
}));

const mockGetVersions = vi.fn();
const mockGetVersion = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptQueries: {
    chapterVersions: (options: unknown) => ({
      queryKey: ['versions-diff-test', options],
      queryFn: () => mockGetVersions(options),
    }),
    chapterVersion: (options: { path: { version_id: string } }) => ({
      queryKey: ['version-detail-diff-test', options.path.version_id],
      queryFn: () => mockGetVersion(options),
    }),
  },
}));

import { VersionsPage } from '@/features/editor/components/versions-page';

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
    body: '',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VersionsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ workId: 'w1', chapterId: 'ch1' });
  mockUseWorkChapters.mockReturnValue({ isPending: false, isError: false });
  useWorksStore.setState({
    works: [{ id: 'w1', chapters: [{ id: 'ch1', episodeId: 'ep1', title: '1화' }] } as never],
  });
});

describe('VersionsPage — 버전 diff 완료 기준 ②', () => {
  it('한 어절만 바뀐 입력에서 변경 행이 하나만 나온다', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:32:00', charCount: 60, charDelta: 1 }),
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:18:00', charCount: 59, charDelta: 59 }),
      ],
      total: 2,
    });
    const oldBody = '첫 문단이다.\n둘째 문단은 그대로다.\n셋째 문단도 그대로다.';
    const newBody = '첫 문단이다.\n둘째 문단은 바뀌었다.\n셋째 문단도 그대로다.';
    mockGetVersion.mockImplementation((options: { path: { version_id: string } }) =>
      Promise.resolve(makeDetail({ body: options.path.version_id === 'v2' ? newBody : oldBody }))
    );

    const { container } = renderPage();

    // 변경 표시(diff-added/diff-removed 라벨 — react-diff-viewer-continued/styles.js가
    // emotion label로 클래스명에 새겨 넣는다, 실측 확인됨)를 가진 행이 나타날 때까지 기다린다.
    await waitFor(() => {
      expect(
        container.querySelectorAll('[class*="diff-added"], [class*="diff-removed"]').length
      ).toBeGreaterThan(0);
    });

    const changedCells = container.querySelectorAll(
      '[class*="diff-added"], [class*="diff-removed"]'
    );
    const changedRows = new Set(Array.from(changedCells).map((el) => el.closest('tr')));
    expect(changedRows.size).toBe(1);
  });
});
