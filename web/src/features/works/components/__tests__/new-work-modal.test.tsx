import { render, screen, waitFor } from '@testing-library/react';
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

import { NewWorkModal } from '../new-work-modal';

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

async function fillTitleAndSubmit(title: string) {
  await userEvent.type(screen.getByPlaceholderText('예: 검을 거꾸로 쥔 회귀자'), title);
  await userEvent.click(screen.getByRole('button', { name: /작품 시작|만드는 중/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPending = false;
});

describe('NewWorkModal', () => {
  it('submits the create mutation with the collected form fields', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);

    render(<NewWorkModal />);
    await fillTitleAndSubmit(CREATED.title);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        body: {
          title: CREATED.title,
          genre: '무협',
          keywords: ['회귀 / 환생'],
          style: '간결체',
        },
      });
    });
  });

  it('on success pushes the created work into the store and navigates to the write screen', async () => {
    mockMutateAsync.mockResolvedValue(CREATED);

    render(<NewWorkModal />);
    await fillTitleAndSubmit(CREATED.title);

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

  it('disables the submit button while the mutation is pending', async () => {
    mockIsPending = true;

    render(<NewWorkModal />);
    await userEvent.type(screen.getByPlaceholderText('예: 검을 거꾸로 쥔 회귀자'), CREATED.title);

    expect(screen.getByRole('button', { name: /작품 시작|만드는 중/ })).toBeDisabled();
  });

  it('shows an inline error and does not navigate when creation fails', async () => {
    mockMutateAsync.mockRejectedValue({
      response: { data: { detail: '이미 사용 중인 제목입니다.' } },
    });

    render(<NewWorkModal />);
    await fillTitleAndSubmit(CREATED.title);

    await waitFor(() => {
      expect(screen.getByText('이미 사용 중인 제목입니다.')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockAddWorkFromServer).not.toHaveBeenCalled();
  });
});
