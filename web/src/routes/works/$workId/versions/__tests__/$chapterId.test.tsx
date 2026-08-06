import type { ChapterVersionDetailResponse, ChapterVersionListItem } from '@/api';
import { useWorksStore } from '@/features/shared/store/works.store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-diff-viewer-continued 자체는 실제 렌더(줄바꿈 등)를 검증하지 않는 테스트에서는 목으로
// 대체해 oldValue/newValue 전달 여부만 스파이한다 — 실제 diff 렌더 검증은 $chapterId.diff.test.tsx.
const mockDiffViewer = vi.fn();
vi.mock('react-diff-viewer-continued', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-diff-viewer-continued')>();
  return {
    ...actual,
    default: (props: Record<string, unknown>) => {
      mockDiffViewer(props);
      return <div data-testid="diff-viewer-mock" />;
    },
  };
});

// --- mocks (read/$chapterId.test.tsx + version-history-modal.test.tsx와 동일 패턴) ---
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
      queryKey: ['versions-page-test', options],
      queryFn: () => mockGetVersions(options),
    }),
    chapterVersion: (options: { path: { version_id: string } }) => ({
      queryKey: ['version-detail-test', options.path.version_id],
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
    body: '본문',
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

describe('VersionsPage — 완료 기준 ①', () => {
  it('주소로 열면 목록이 서버 데이터로 뜬다', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00', charCount: 3412, charDelta: 128 }),
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:18:00', charCount: 3284, charDelta: -410 }),
      ],
      total: 2,
    });

    renderPage();

    // 목록 항목(쿼리 데이터 의존)을 먼저 기다려야 그 뒤 동기 단언이 유효하다 — 헤더 텍스트는
    // 쿼리와 무관해 findByText가 데이터 로딩을 기다려주지 않는다.
    expect(await screen.findByText('+128')).toBeInTheDocument();
    expect(screen.getByText('버전 기록 · 1화')).toBeInTheDocument();
    expect(screen.getAllByTestId('version-item')).toHaveLength(2);
  });

  it('더 보기로 다음 페이지가 누적되고 항목이 중복되지 않는다', async () => {
    const TOTAL = 45;
    const seriesUpTo = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        makeItem({
          id: `v${i}`,
          createdAt: new Date(Date.parse('2026-08-05T14:32:00') - i * 60_000).toISOString(),
          charCount: 1000 - i,
          charDelta: 5,
        })
      );
    mockGetVersions.mockImplementation((options: { query: { limit: number } }) =>
      Promise.resolve({ items: seriesUpTo(Math.min(options.query.limit, TOTAL)), total: TOTAL })
    );

    renderPage();

    expect(await screen.findByText('더 보기 (15개 남음)')).toBeInTheDocument();
    expect(screen.getAllByTestId('version-item')).toHaveLength(30);

    await userEvent.click(screen.getByRole('button', { name: '더 보기 (15개 남음)' }));

    await waitFor(() => expect(screen.getAllByTestId('version-item')).toHaveLength(45));
    expect(screen.queryByText(/더 보기/)).not.toBeInTheDocument();
    const labels = screen.getAllByTestId('version-item').map((el) => el.textContent);
    expect(new Set(labels).size).toBe(45);
  });
});

describe('VersionsPage — 버전 diff 완료 기준 ①', () => {
  it('좌(직전 버전)·우(선택 버전) 본문을 각각 조회해 oldValue/newValue로 전달한다', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:32:00', charCount: 200, charDelta: 20 }),
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:18:00', charCount: 180, charDelta: 180 }),
      ],
      total: 2,
    });
    mockGetVersion.mockImplementation((options: { path: { version_id: string } }) =>
      Promise.resolve(
        makeDetail({
          id: options.path.version_id,
          body: options.path.version_id === 'v2' ? '최신 본문' : '직전 본문',
        })
      )
    );

    renderPage();

    await waitFor(() => expect(mockDiffViewer).toHaveBeenCalled());
    const props = mockDiffViewer.mock.calls.at(-1)?.[0] as { oldValue: string; newValue: string };
    expect(props.oldValue).toBe('직전 본문');
    expect(props.newValue).toBe('최신 본문');
  });
});

describe('VersionsPage — 버전 diff 완료 기준 ③', () => {
  it('본문 조회 실패 시 에러 문구를 보여주고 diff는 렌더하지 않는다', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:32:00', charCount: 200, charDelta: 20 }),
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:18:00', charCount: 180, charDelta: 180 }),
      ],
      total: 2,
    });
    mockGetVersion.mockRejectedValue(new Error('network fail'));

    renderPage();

    expect(await screen.findByText('버전을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-viewer-mock')).not.toBeInTheDocument();
    expect(mockDiffViewer).not.toHaveBeenCalled();
  });
});

describe('VersionsPage — S4 좌/우 선택', () => {
  function threeItems() {
    return [
      makeItem({ id: 'v3', createdAt: '2026-08-05T14:32:00', charCount: 300, charDelta: 10 }),
      makeItem({ id: 'v2', createdAt: '2026-08-05T14:18:00', charCount: 290, charDelta: 20 }),
      makeItem({ id: 'v1', createdAt: '2026-08-05T14:00:00', charCount: 270, charDelta: null }),
    ];
  }
  function echoBody(options: { path: { version_id: string } }) {
    return Promise.resolve(
      makeDetail({ id: options.path.version_id, body: `본문-${options.path.version_id}` })
    );
  }

  it('항목 클릭 시 좌만 바뀌고 우는 그대로다 (완료 기준 ①)', async () => {
    mockGetVersions.mockResolvedValue({ items: threeItems(), total: 3 });
    mockGetVersion.mockImplementation(echoBody);

    renderPage();

    await waitFor(() => expect(mockDiffViewer).toHaveBeenCalled());
    const before = mockDiffViewer.mock.calls.at(-1)?.[0] as { oldValue: string; newValue: string };
    expect(before.oldValue).toBe('본문-v2'); // 좌 기본값 = 최신 직전 버전
    expect(before.newValue).toBe('본문-v3'); // 우 기본값 = 현재(최신)

    await userEvent.click(screen.getAllByTestId('version-item')[2]); // v1(가장 오래된 항목) 클릭

    await waitFor(() => {
      const after = mockDiffViewer.mock.calls.at(-1)?.[0] as { oldValue: string };
      expect(after.oldValue).toBe('본문-v1');
    });
    const after = mockDiffViewer.mock.calls.at(-1)?.[0] as { oldValue: string; newValue: string };
    expect(after.newValue).toBe('본문-v3'); // 우는 그대로
  });

  it('"우로 지정"으로 우만 바뀐다 (완료 기준 ②)', async () => {
    mockGetVersions.mockResolvedValue({ items: threeItems(), total: 3 });
    mockGetVersion.mockImplementation(echoBody);

    renderPage();
    await waitFor(() => expect(mockDiffViewer).toHaveBeenCalled());

    await userEvent.click(screen.getAllByRole('button', { name: '우로 지정' })[2]); // v1을 우로 지정

    await waitFor(() => {
      const after = mockDiffViewer.mock.calls.at(-1)?.[0] as { newValue: string };
      expect(after.newValue).toBe('본문-v1');
    });
    const after = mockDiffViewer.mock.calls.at(-1)?.[0] as { oldValue: string; newValue: string };
    expect(after.oldValue).toBe('본문-v2'); // 좌는 그대로
  });

  it('좌·우가 같은 버전이면 diff 대신 "변경 없음" 문구가 뜬다 (완료 기준 ③)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:32:00' }),
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:18:00' }),
      ],
      total: 2,
    });
    mockGetVersion.mockImplementation(echoBody);

    renderPage();
    await waitFor(() => expect(mockDiffViewer).toHaveBeenCalled());

    // v1(기본값 좌)을 우로도 지정 — 좌·우가 같은 버전이 된다.
    await userEvent.click(screen.getAllByRole('button', { name: '우로 지정' })[1]);

    expect(await screen.findByText('변경 없음')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-viewer-mock')).not.toBeInTheDocument();
  });

  it('좌·우 배지가 서로 다른 항목에 붙는다 (완료 기준 ④)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:32:00' }),
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:18:00' }),
      ],
      total: 2,
    });
    mockGetVersion.mockImplementation(echoBody);

    renderPage();
    await screen.findByText('우'); // 기본 선택(우=최신) 반영 대기

    const rows = screen.getAllByTestId('version-item');
    expect(within(rows[0]).getByText('우')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('좌')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('좌')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('우')).not.toBeInTheDocument();
  });
});
