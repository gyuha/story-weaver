import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockMutateAsync = vi.fn();
let mockIsPending = false;
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutateAsync: mockMutateAsync, isPending: mockIsPending }),
}));

vi.mock('@/features/works/api/works.api', () => ({
  worksMutations: { create: () => ({}) },
}));

const mockAddWorkFromServer = vi.fn();
vi.mock('@/features/shared/store/works.store', () => ({
  useWorksStore: (selector: (s: { addWorkFromServer: (w: unknown) => void }) => unknown) =>
    selector({ addWorkFromServer: mockAddWorkFromServer }),
}));

// eco: jsdom doesn't implement scrollIntoView/ResizeObserver, which cmdk (GenreSelect) relies on.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

import { NewWorkScreen } from '../new-work-screen';

const CREATED = {
  id: 'w-1',
  title: '검을 거꾸로 쥔 회귀자',
  shortLabel: '검',
  genre: '무협',
  subGenre: '회귀 / 환생',
  keywords: ['회귀 / 환생'],
  style: '간결체',
  status: '구상',
  coverTheme: 'dark',
  lastEditedLabel: '방금',
  stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

function setup() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}

async function chooseGenre(user: ReturnType<typeof setup>, label: string) {
  await user.click(screen.getByRole('button', { expanded: false }));
  await user.click(screen.getByRole('option', { name: new RegExp(label) }));
}

function nextButton() {
  return screen.getByRole('button', { name: '다음' });
}

async function goToTitleStep(user: ReturnType<typeof setup>, genreLabel = '무협') {
  await chooseGenre(user, genreLabel);
  await user.click(nextButton()); // step1 -> step2
  await user.click(nextButton()); // step2 -> step3
}

async function fillTitleAndSubmit(user: ReturnType<typeof setup>, title: string) {
  await user.type(screen.getByPlaceholderText('예: 검을 거꾸로 쥔 회귀자'), title);
  await user.click(screen.getByRole('button', { name: /작품 시작|만드는 중/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPending = false;
});

describe('NewWorkScreen', () => {
  it('장르 전환 시 프리셋 키워드 선택은 초기화되고 자유 태그는 유지된다', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);
    const user = setup();

    render(<NewWorkScreen />);

    await chooseGenre(user, '무협');
    await user.click(screen.getByRole('button', { name: '성장' })); // 무협 프리셋 키워드 선택
    await user.type(screen.getByPlaceholderText('키워드를 입력하고 Enter'), 'MyFreeTag{Enter}');

    // 다른 장르로 전환 — 프리셋 키워드 목록 자체가 바뀐다(무협 전용 '성장'은 더 이상 없음)
    await chooseGenre(user, '로맨스 판타지');
    expect(screen.queryByRole('button', { name: '성장' })).not.toBeInTheDocument();
    expect(screen.getByText('MyFreeTag')).toBeInTheDocument(); // 자유 태그는 유지

    await user.click(nextButton());
    await user.click(nextButton());
    await fillTitleAndSubmit(user, CREATED.title);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        body: {
          title: CREATED.title,
          genre: '로맨스 판타지',
          keywords: ['MyFreeTag'], // '성장' 선택은 장르 전환으로 초기화되어 포함되지 않는다
          style: '서정체', // 로맨스 판타지의 defaultStyle
        },
      });
    });
  });

  it('같은 장르를 재선택해도 프리셋 키워드 선택과 사용자가 바꾼 문체가 초기화되지 않는다', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);
    const user = setup();

    render(<NewWorkScreen />);

    await chooseGenre(user, '무협');
    await user.click(screen.getByRole('button', { name: '성장' })); // 무협 프리셋 키워드 선택

    await user.click(nextButton()); // step1 -> step2
    await user.click(screen.getByText('서정체')); // 기본 문체(간결체)에서 수동 변경

    // step 인디케이터로 step1로 되돌아가 같은 장르('무협')를 재클릭
    await user.click(screen.getByRole('button', { name: /1.*장르/ }));
    await chooseGenre(user, '무협');

    // 재선택 직후 '성장'은 여전히 선택된 상태여야 한다
    expect(screen.getByRole('button', { name: '성장' })).toHaveClass('bg-ink');

    await user.click(nextButton()); // step1 -> step2
    // step2의 문체도 사용자가 고른 '서정체'로 유지돼야 한다(기본 '간결체'로 되돌아가면 안 됨)
    expect(screen.getByText('서정체').closest('button')).toHaveClass('border-primary');

    await user.click(nextButton()); // step2 -> step3
    await fillTitleAndSubmit(user, CREATED.title);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        body: {
          title: CREATED.title,
          genre: '무협',
          keywords: ['성장'],
          style: '서정체',
        },
      });
    });
  });

  it('장르 미선택 시 다음 버튼이, 제목이 비어있으면 작품 시작 버튼이 비활성화된다', async () => {
    const user = setup();
    render(<NewWorkScreen />);

    expect(nextButton()).toBeDisabled();

    await chooseGenre(user, '무협');
    expect(nextButton()).not.toBeDisabled();

    await user.click(nextButton());
    await user.click(nextButton());

    expect(screen.getByRole('button', { name: '작품 시작' })).toBeDisabled();

    await user.type(screen.getByPlaceholderText('예: 검을 거꾸로 쥔 회귀자'), '제목');
    expect(screen.getByRole('button', { name: '작품 시작' })).not.toBeDisabled();
  });

  it('제출 payload는 프리셋 선택과 자유 태그를 병합하고 대소문자 무시로 중복을 제거한다', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);
    const user = setup();

    render(<NewWorkScreen />);

    await chooseGenre(user, '무협');
    // 자유 태그로 먼저 입력한 뒤, 같은 문자열의 프리셋 키워드도 선택 — 두 소스 간 중복 발생
    await user.type(screen.getByPlaceholderText('키워드를 입력하고 Enter'), '회귀 / 환생{Enter}');
    await user.click(screen.getByRole('button', { name: '회귀 / 환생' }));
    await user.click(screen.getByRole('button', { name: '성장' }));

    await user.click(nextButton());
    await user.click(nextButton());
    await fillTitleAndSubmit(user, CREATED.title);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        body: {
          title: CREATED.title,
          genre: '무협',
          keywords: ['회귀 / 환생', '성장'], // 중복 제거되어 한 번만 포함
          style: '간결체',
        },
      });
    });
  });

  it('오버레이나 대시보드 배경 없이 페이지 자체로 렌더된다', () => {
    const { container } = render(<NewWorkScreen />);

    expect(container.querySelector('.fixed')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('닫기')).toHaveLength(1); // 우상단 X만 존재
  });

  it('on success pushes the created work into the store and navigates to the write screen', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);
    const user = setup();

    render(<NewWorkScreen />);
    await goToTitleStep(user);
    await fillTitleAndSubmit(user, CREATED.title);

    await waitFor(() => {
      expect(mockAddWorkFromServer).toHaveBeenCalledWith({
        id: 'w-1',
        title: CREATED.title,
        shortLabel: '검',
        genre: '무협',
        subGenre: '회귀 / 환생',
        keywords: ['회귀 / 환생'],
        style: '간결체',
        status: '구상',
        coverTheme: 'dark',
        stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
        lastEditedLabel: '방금',
        chapters: [],
        entities: [],
        timeline: [],
        conflicts: [],
        reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/works/$workId/write',
      params: { workId: 'w-1' },
    });
  });

  it('제목 입력의 IME 조합 중 Enter로는 제출되지 않는다', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);
    const user = setup();

    render(<NewWorkScreen />);
    await goToTitleStep(user);

    const input = screen.getByPlaceholderText('예: 검을 거꾸로 쥔 회귀자');
    await user.type(input, '회귀자');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('disables the submit button while the mutation is pending', async () => {
    mockIsPending = true;
    const user = setup();

    render(<NewWorkScreen />);
    await goToTitleStep(user);
    await user.type(screen.getByPlaceholderText('예: 검을 거꾸로 쥔 회귀자'), CREATED.title);

    expect(screen.getByRole('button', { name: /작품 시작|만드는 중/ })).toBeDisabled();
  });

  it('shows an inline error and does not navigate when creation fails', async () => {
    mockMutateAsync.mockRejectedValue({
      response: { data: { detail: '이미 사용 중인 제목입니다.' } },
    });
    const user = setup();

    render(<NewWorkScreen />);
    await goToTitleStep(user);
    await fillTitleAndSubmit(user, CREATED.title);

    await waitFor(() => {
      expect(screen.getByText('이미 사용 중인 제목입니다.')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockAddWorkFromServer).not.toHaveBeenCalled();
  });
});
