import type { ArtStyleResponse, WorkArtStyleResponse } from '@/api';
import type { Work } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListArtStyles = vi.fn();
const mockGetWorkArtStyle = vi.fn();
const mockUpdateWorkArtStyleMutationFn = vi.fn();
const mockHasAnyEntityImages = vi.fn();

vi.mock('@/features/works/api/art-styles.api', () => ({
  artStylesQueries: {
    list: () => ({ queryKey: ['art-styles-test'], queryFn: () => mockListArtStyles() }),
    work: (options: unknown) => ({
      queryKey: ['work-art-style-test', options],
      queryFn: () => mockGetWorkArtStyle(options),
    }),
  },
  artStylesMutations: {
    update: () => ({
      mutationFn: (options: unknown) => mockUpdateWorkArtStyleMutationFn(options),
    }),
  },
  hasAnyEntityImages: (...args: unknown[]) => mockHasAnyEntityImages(...args),
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
import { ArtStyleScreen } from '../art-style-screen';

const WORK_ID = 'w1';

const WORK: Work = {
  id: WORK_ID,
  title: '테스트 작품',
  shortLabel: '테',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  styleNote: null,
  status: '구상',
  coverTheme: 'dark',
  stats: { chapters: 0, words: '0', wordsUnit: '천자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [],
  entities: [
    { id: 'e1', type: '인물', name: '서리검', emoji: '🗡️', summary: '', fields: [] },
    { id: 'e2', type: '장소', name: '설산', emoji: '🏔️', summary: '', fields: [] },
  ],
  timeline: [],
  conflicts: [],
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

function sample(styleId: string, entityType: string) {
  return `/api/v1/art-styles/${styleId}/samples/${entityType}`;
}

const ART_STYLES: ArtStyleResponse[] = [
  {
    id: 'ink',
    label: '수묵화',
    samples: {
      character: sample('ink', 'character'),
      location: sample('ink', 'location'),
      event: sample('ink', 'event'),
      item: sample('ink', 'item'),
    },
  },
  {
    id: 'webtoon',
    label: '웹툰',
    samples: {
      character: sample('webtoon', 'character'),
      location: sample('webtoon', 'location'),
      event: sample('webtoon', 'event'),
      item: sample('webtoon', 'item'),
    },
  },
  {
    id: 'oil',
    label: '유화',
    samples: {
      character: sample('oil', 'character'),
      location: sample('oil', 'location'),
      event: sample('oil', 'event'),
      item: sample('oil', 'item'),
    },
  },
  {
    id: 'photo',
    label: '사진풍',
    samples: {
      character: sample('photo', 'character'),
      location: sample('photo', 'location'),
      event: sample('photo', 'event'),
      item: sample('photo', 'item'),
    },
  },
];

function unspecified(): WorkArtStyleResponse {
  return { artStyleId: null, artStyleNote: null };
}

function renderScreen(work: Work = WORK) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ArtStyleScreen work={work} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListArtStyles.mockResolvedValue(ART_STYLES);
  mockGetWorkArtStyle.mockResolvedValue(unspecified());
  mockUpdateWorkArtStyleMutationFn.mockResolvedValue({ artStyleId: 'ink', artStyleNote: '' });
  mockHasAnyEntityImages.mockResolvedValue(false);
});

describe('ArtStyleScreen', () => {
  it('화풍 4개를 렌더한다', async () => {
    renderScreen();
    for (const style of ART_STYLES) {
      expect(await screen.findByRole('button', { name: style.label })).toBeInTheDocument();
    }
  });

  it('각 화풍마다 유형 견본 3장(인물·장소·아이템)을 보여준다', async () => {
    renderScreen();
    expect(await screen.findByAltText('수묵화 인물 견본')).toBeInTheDocument();
    expect(screen.getByAltText('수묵화 장소 견본')).toBeInTheDocument();
    expect(screen.getByAltText('수묵화 아이템 견본')).toBeInTheDocument();
    // 사건 견본은 이 화면에 없다(그릴링 C안 — 인물·장소·아이템 3장).
    expect(screen.queryByAltText('수묵화 사건 견본')).not.toBeInTheDocument();
  });

  it('현재 작품의 화풍이 선택된 상태로 뜬다', async () => {
    mockGetWorkArtStyle.mockResolvedValue({ artStyleId: 'webtoon', artStyleNote: '밝은 톤' });
    renderScreen();

    expect(await screen.findByRole('button', { name: '웹툰' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: '수묵화' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('화풍이 미지정이면 아무것도 선택되지 않은 상태다', async () => {
    renderScreen();
    for (const style of ART_STYLES) {
      expect(await screen.findByRole('button', { name: style.label })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    }
  });

  it('견본이 404여도 깨진 이미지 대신 대체 아이콘을 보여준다', async () => {
    renderScreen();
    const img = await screen.findByAltText('수묵화 인물 견본');
    img.dispatchEvent(new Event('error'));

    await waitFor(() => expect(screen.queryByAltText('수묵화 인물 견본')).not.toBeInTheDocument());
  });

  it('화풍을 고르고 저장하면 PUT을 1회 보낸다', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: '수묵화' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mockUpdateWorkArtStyleMutationFn).toHaveBeenCalledTimes(1));
    expect(mockUpdateWorkArtStyleMutationFn).toHaveBeenCalledWith({
      path: { work_id: WORK_ID },
      body: { artStyleId: 'ink', artStyleNote: '' },
    });
  });

  it('이미지가 0장이면 확인창 없이 저장한다', async () => {
    mockGetWorkArtStyle.mockResolvedValue({ artStyleId: 'ink', artStyleNote: '' });
    mockHasAnyEntityImages.mockResolvedValue(false);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: '웹툰' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mockUpdateWorkArtStyleMutationFn).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('이미지가 1장 이상이고 화풍을 바꾸면 확인창이 뜨고, 취소하면 PUT이 나가지 않는다', async () => {
    mockGetWorkArtStyle.mockResolvedValue({ artStyleId: 'ink', artStyleNote: '' });
    mockHasAnyEntityImages.mockResolvedValue(true);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: '웹툰' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    const cancelButton = await screen.findByRole('button', { name: '취소' });
    await user.click(cancelButton);

    // 목이 부작용을 재현한다 — "확인창이 떴다"가 아니라 취소 후 PUT이 안 나가는 것을 본다.
    expect(mockUpdateWorkArtStyleMutationFn).not.toHaveBeenCalled();
  });

  it('확인창에서 확인을 누르면 PUT이 나간다', async () => {
    mockGetWorkArtStyle.mockResolvedValue({ artStyleId: 'ink', artStyleNote: '' });
    mockHasAnyEntityImages.mockResolvedValue(true);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: '웹툰' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    const confirmButton = await screen.findByRole('button', { name: '확인' });
    await user.click(confirmButton);

    await waitFor(() => expect(mockUpdateWorkArtStyleMutationFn).toHaveBeenCalledTimes(1));
  });

  it('톤만 바꾸면 확인창 없이 저장한다', async () => {
    mockGetWorkArtStyle.mockResolvedValue({ artStyleId: 'ink', artStyleNote: '기존 톤' });
    const user = userEvent.setup();
    renderScreen();

    const toneInput = await screen.findByLabelText('작품 고유의 톤');
    await waitFor(() => expect(toneInput).toHaveValue('기존 톤'));
    await user.clear(toneInput);
    await user.type(toneInput, '새 톤');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mockUpdateWorkArtStyleMutationFn).toHaveBeenCalledTimes(1));
    expect(mockHasAnyEntityImages).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('저장에 실패하면 에러 토스트를 보여준다', async () => {
    mockUpdateWorkArtStyleMutationFn.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: '웹툰' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
