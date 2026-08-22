import { useWork } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Work } from '@/features/shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/work-shell', () => ({
  WorkShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const mockList = vi.fn();
vi.mock('@/features/timeline/api/conflicts.api', () => ({
  conflictsApi: { list: (...args: unknown[]) => mockList(...args) },
}));

vi.mock('sonner', () => {
  const toast = vi.fn() as unknown as {
    (message: string): void;
    success: ReturnType<typeof vi.fn>;
  };
  toast.success = vi.fn();
  return { toast };
});

import { TimelineScreen } from '../timeline-screen';

const WORK_ID = 'w1';

const WORK: Work = {
  id: WORK_ID,
  title: '천뢰검전',
  shortLabel: '천',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  styleNote: null,
  status: '연재 중',
  coverTheme: 'dark',
  stats: { chapters: 0, words: '0', wordsUnit: '만자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [],
  entities: [],
  timeline: [],
  conflicts: [
    {
      id: 'ts1_ts2',
      entityId: 'en1',
      entityName: '이서하',
      stateKey: 'life_status',
      earlier: { chapterId: 'ch1', chapterRef: '3화', globalSeq: 30, stateValue: 'dead' },
      later: { chapterId: 'ch2', chapterRef: '10화', globalSeq: 100, stateValue: 'alive' },
    },
  ],
  reviewSummary: { scenes: 0, states: 0, conflicts: 1 },
};

function Harness() {
  const work = useWork(WORK_ID);
  if (!work) return null;
  return <TimelineScreen work={work} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorksStore.setState({ works: [structuredClone(WORK)] });
});

describe('TimelineScreen 충돌 표시', () => {
  it('충돌 후보의 엔티티명·상태키·이전/이후 화 참조와 값을 표시한다', () => {
    render(<Harness />);

    expect(screen.getByText('이서하')).toBeInTheDocument();
    expect(screen.getByText('life_status')).toBeInTheDocument();
    expect(screen.getByText('3화')).toBeInTheDocument();
    expect(screen.getByText('10화')).toBeInTheDocument();
    expect(screen.getByText('dead')).toBeInTheDocument();
    expect(screen.getByText('alive')).toBeInTheDocument();
  });

  it('무시를 누르면 API를 호출하지 않고 로컬 뷰에서만 해당 충돌을 숨긴다', async () => {
    render(<Harness />);
    expect(screen.getByText('이서하')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '의도된 변화 — 무시' }));

    expect(screen.queryByText('이서하')).not.toBeInTheDocument();
    expect(useWorksStore.getState().works[0].conflicts).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('TimelineScreen 화별 요약', () => {
  const chapter = (over: Partial<Work['chapters'][number]>): Work['chapters'][number] => ({
    id: 'ch1',
    episodeId: 'ep1',
    partLabel: '제1부',
    index: 1,
    title: '1화',
    status: 'draft',
    paragraphs: [],
    linkedEntityIds: [],
    vectorMemory: [],
    ...over,
  });

  it('화를 순서대로 보여주고 요약이 있으면 본문을 렌더한다 (task #68 S3)', () => {
    useWorksStore.setState({
      works: [
        {
          ...structuredClone(WORK),
          chapters: [
            chapter({ id: 'c1', index: 1, title: '회귀의 시작', summary: '주인공이 회귀했다.' }),
            chapter({ id: 'c2', index: 2, title: '거울', summary: '거울에서 눈을 보았다.' }),
          ],
        },
      ],
    });
    render(<Harness />);

    expect(screen.getByText('화별 요약')).toBeInTheDocument();
    expect(screen.getByText('주인공이 회귀했다.')).toBeInTheDocument();
    expect(screen.getByText('거울에서 눈을 보았다.')).toBeInTheDocument();

    const labels = screen.getAllByText(/^\d화 · /).map((el) => el.textContent);
    expect(labels).toEqual(['1화 · 회귀의 시작', '2화 · 거울']);
  });

  it('요약이 없는 화는 없음을 드러낸다 — 빈 곳이 보이는 것이 한눈에 보기의 절반이다', () => {
    useWorksStore.setState({
      works: [
        {
          ...structuredClone(WORK),
          chapters: [
            chapter({ id: 'c1', index: 1, title: '회귀의 시작', summary: '주인공이 회귀했다.' }),
            chapter({ id: 'c2', index: 2, title: '추적' }),
          ],
        },
      ],
    });
    render(<Harness />);

    expect(screen.getByText('요약 없음')).toBeInTheDocument();
  });

  it('화가 없으면 빈 안내를 보여주고 깨지지 않는다', () => {
    render(<Harness />); // WORK.chapters = []
    expect(screen.getByText('화별 요약')).toBeInTheDocument();
    expect(screen.getByText(/아직 화가 없습니다/)).toBeInTheDocument();
  });

  it('요약 섹션은 충돌 뒤, 타임라인 상태 기록 앞에 온다 (배치 결정)', () => {
    useWorksStore.setState({
      works: [
        {
          ...structuredClone(WORK),
          chapters: [chapter({ id: 'c1', summary: '요약 본문' })],
        },
      ],
    });
    render(<Harness />);

    const html = document.body.innerHTML;
    const conflictAt = html.indexOf('설정 충돌 후보');
    const summaryAt = html.indexOf('화별 요약');
    const statesAt = html.indexOf('최근 타임라인 상태 기록');
    expect(conflictAt).toBeGreaterThanOrEqual(0);
    expect(summaryAt).toBeGreaterThan(conflictAt);
    expect(statesAt).toBeGreaterThan(summaryAt);
  });
});
