import type { ChapterVersionDetailResponse, ChapterVersionListItem } from '@/api';
import type { Chapter } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---
// synopsis-editor.test.tsx와 동일 패턴: manuscriptQueries의 각 팩토리를 {queryKey, queryFn}로
// 바꿔 실제 axios 대신 스파이가 응답을 결정하게 한다. queryKey에 options를 실어 limit·
// version_id가 다르면 실제로 다른 캐시 항목이 되게 한다(같은 version_id면 dedupe도 재현된다).
const mockGetVersions = vi.fn();
const mockGetVersion = vi.fn();
vi.mock('@/features/editor/api/manuscript.api', () => ({
  manuscriptQueries: {
    chapterVersions: (options: unknown) => ({
      queryKey: ['chapter-versions-test', options],
      queryFn: () => mockGetVersions(options),
    }),
    chapterVersion: (options: unknown) => ({
      queryKey: ['chapter-version-test', options],
      queryFn: () => mockGetVersion(options),
    }),
  },
}));

import { VersionHistoryModal } from '../version-history-modal';

const CHAPTER: Chapter = {
  id: 'ch1',
  episodeId: 'ep1',
  partLabel: '제1부',
  index: 1,
  title: '1화',
  status: 'draft',
  paragraphs: [{ text: '원본 문단' }],
  linkedEntityIds: [],
  vectorMemory: [],
};

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

function renderModal(props: Partial<Parameters<typeof VersionHistoryModal>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VersionHistoryModal
        workId="w1"
        chapter={CHAPTER}
        currentText="현재 편집 중인 본문"
        restoring={false}
        onRestore={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값: 단건 조회는 요청한 version_id를 그대로 되돌린다(개별 테스트가 필요시 덮어씀).
  mockGetVersion.mockImplementation((options: { path: { version_id: string } }) =>
    Promise.resolve(makeDetail({ id: options.path.version_id }))
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VersionHistoryModal — S2 목록 조회 + C안', () => {
  it('날짜 그룹 헤더가 자정을 기준으로 갈린다 — 경과 시간이 아니다 (완성 기준 ①)', async () => {
    // Date만 고정(setTimeout 등은 실제로 둬야 waitFor/findBy가 정상 동작한다).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-06T00:10:00'));

    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v1', createdAt: '2026-08-06T00:05:00' }), // 5분 전, 오늘 자정 이후
        makeItem({ id: 'v2', createdAt: '2026-08-05T23:55:00' }), // 15분 전, 어제(자정 이전)
      ],
      total: 2,
    });

    renderModal();

    expect(await screen.findByText('오늘')).toBeInTheDocument();
    expect(screen.getByText('어제')).toBeInTheDocument();
  });

  it('증감 부호가 맞고, 가장 오래된 항목(charDelta: null)은 증감이 렌더되지 않는다 (완성 기준 ②)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00', charCount: 3412, charDelta: 128 }),
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:18:00', charCount: 3284, charDelta: -410 }),
        makeItem({ id: 'v3', createdAt: '2026-08-04T23:41:00', charCount: 2592, charDelta: null }),
      ],
      total: 3,
    });

    renderModal();

    expect(await screen.findByText('+128')).toBeInTheDocument();
    expect(screen.getByText('−410')).toBeInTheDocument();
    // 가장 오래된 항목의 글자 수는 뜨지만 증감 부호(+ 또는 −)는 없다.
    const oldest = screen.getByText('2,592자');
    expect(oldest.textContent).toBe('2,592자');
  });

  it('미저장 편집분이 버전 목록에 섞이지 않는다 (완성 기준 ③)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [
        makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00' }),
        makeItem({ id: 'v2', createdAt: '2026-08-05T14:18:00' }),
      ],
      total: 2,
    });
    // 최신 버전 본문과 currentText가 달라 미저장 편집분이 있는 상태.
    mockGetVersion.mockResolvedValue(makeDetail({ id: 'v1', body: '저장된 본문' }));

    renderModal({ currentText: '지금 고치는 중인 본문' });

    expect(await screen.findByText('편집 중 · 미저장')).toBeInTheDocument();
    // 버전 항목은 정확히 2개 — 미저장 표시는 그 목록 루프 밖의 별도 요소다.
    expect(screen.getAllByTestId('version-item')).toHaveLength(2);
  });

  it('더 보기로 다음 페이지가 누적되고 항목이 중복되지 않는다 (완성 기준 ④)', async () => {
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
    // 저장된 상태로 둬 미저장 표시가 카운트를 흐리지 않게 한다.
    mockGetVersion.mockResolvedValue(makeDetail({ id: 'v0', body: '현재와 같음' }));

    renderModal({ currentText: '현재와 같음' });

    expect(await screen.findByText('더 보기 (15개 남음)')).toBeInTheDocument();
    expect(screen.getAllByTestId('version-item')).toHaveLength(30);

    await userEvent.click(screen.getByRole('button', { name: '더 보기 (15개 남음)' }));

    await waitFor(() => expect(screen.getAllByTestId('version-item')).toHaveLength(45));
    expect(screen.queryByText(/더 보기/)).not.toBeInTheDocument();
    // 중복 없이 누적됐는지 — 각 항목의 글자 수 표시가 45개 모두 서로 다르다.
    const labels = screen.getAllByTestId('version-item').map((el) => el.textContent);
    expect(new Set(labels).size).toBe(45);
  });

  it('이력이 0건이면 기록 없음을 보여준다', async () => {
    mockGetVersions.mockResolvedValue({ items: [], total: 0 });

    renderModal();

    expect(await screen.findByText('기록 없음')).toBeInTheDocument();
  });
});

describe('VersionHistoryModal — S3 실시간 현재 + 선택 버전 본문', () => {
  it('저장 없이 에디터를 고친 뒤 diff를 켜면 그 변경분이 보인다 (완성 기준 ①)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00' })],
      total: 1,
    });
    mockGetVersion.mockResolvedValue(makeDetail({ id: 'v1', body: '원본 문장이다' }));

    renderModal({ currentText: '완전히 달라진 문장이다' });
    await screen.findByRole('button', { name: 'diff 보기' });
    await userEvent.click(screen.getByRole('button', { name: 'diff 보기' }));

    // diffWords가 만드는 added/removed 표시(underline/line-through)가 적어도 하나는 있어야 한다.
    await waitFor(() => {
      const changed = document.querySelectorAll('.underline, .line-through');
      expect(changed.length).toBeGreaterThan(0);
    });
  });

  it('저장 직후(현재 == 최신 버전 본문)에는 diff가 비어 있다 (완성 기준 ②)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00' })],
      total: 1,
    });
    mockGetVersion.mockResolvedValue(makeDetail({ id: 'v1', body: '변함없는 본문' }));

    renderModal({ currentText: '변함없는 본문' });
    await screen.findByRole('button', { name: 'diff 보기' });
    await userEvent.click(screen.getByRole('button', { name: 'diff 보기' }));

    await waitFor(() => {
      expect(screen.getByText('선택 버전 → 현재 변경분')).toBeInTheDocument();
    });
    expect(document.querySelectorAll('.underline, .line-through')).toHaveLength(0);
  });

  it('미저장 표시가 ①(다름)에서는 켜지고 ②(같음)에서는 꺼진다 (완성 기준 ③)', async () => {
    mockGetVersions.mockResolvedValue({
      items: [makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00' })],
      total: 1,
    });
    mockGetVersion.mockResolvedValue(makeDetail({ id: 'v1', body: '저장된 본문' }));

    const { unmount } = renderModal({ currentText: '고치는 중이라 다름' });
    expect(await screen.findByText('편집 중 · 미저장')).toBeInTheDocument();
    unmount();

    renderModal({ currentText: '저장된 본문' });
    await screen.findByTestId('version-item');
    expect(screen.queryByText('편집 중 · 미저장')).not.toBeInTheDocument();
  });
});

describe('VersionHistoryModal — S4 되돌리기 재진입 가드 (리뷰 medium)', () => {
  it('restoring이 true면 되돌리기 버튼이 비활성화되고 클릭해도 호출되지 않는다', async () => {
    mockGetVersions.mockResolvedValue({
      items: [makeItem({ id: 'v1', createdAt: '2026-08-05T14:32:00' })],
      total: 1,
    });
    mockGetVersion.mockResolvedValue(makeDetail({ id: 'v1', body: '본문' }));
    const onRestore = vi.fn();

    renderModal({ restoring: true, onRestore });

    const btn = await screen.findByRole('button', { name: '이 버전으로 되돌리기' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onRestore).not.toHaveBeenCalled();
  });
});
