import type { Work } from '@/features/shared/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const mockDownload = vi.fn();
vi.mock('@/features/works/api/manuscript-export.api', () => ({
  downloadManuscriptZip: (...args: unknown[]) => mockDownload(...args),
}));

import { toast } from 'sonner';
import { ManuscriptDownloadButton } from '../manuscript-download-button';

const WORK: Work = {
  id: 'w1',
  title: '테스트 작품',
  shortLabel: '테',
  genre: '무협',
  subGenre: '회귀',
  keywords: [],
  style: '간결체',
  styleNote: null,
  status: '구상',
  coverTheme: 'dark',
  stats: { chapters: 3, words: '12', wordsUnit: '천자', characters: 0, progress: 0 },
  lastEditedLabel: '방금',
  chapters: [],
  entities: [],
  timeline: [],
  conflicts: [],
  reviewSummary: { scenes: 0, states: 0, conflicts: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ManuscriptDownloadButton', () => {
  it('클릭 시 작품 id·제목으로 다운로드 헬퍼를 호출한다', async () => {
    mockDownload.mockResolvedValue(undefined);
    render(<ManuscriptDownloadButton work={WORK} />);

    await userEvent.click(screen.getByRole('button', { name: /다운로드/ }));

    expect(mockDownload).toHaveBeenCalledWith('w1', '테스트 작품');
  });

  it('다운로드 진행 중에는 버튼이 비활성화된다', async () => {
    let resolveDownload: () => void = () => {};
    mockDownload.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      })
    );

    render(<ManuscriptDownloadButton work={WORK} />);
    const button = screen.getByRole('button', { name: /다운로드/ });
    await userEvent.click(button);

    expect(button).toBeDisabled();

    resolveDownload();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('실패 시 응답 detail 메시지를 토스트로 보여준다', async () => {
    mockDownload.mockRejectedValue(
      Object.assign(new Error('내보낼 원고가 없습니다'), {
        response: { data: { detail: '내보낼 원고가 없습니다' } },
      })
    );

    render(<ManuscriptDownloadButton work={WORK} />);
    await userEvent.click(screen.getByRole('button', { name: /다운로드/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('내보낼 원고가 없습니다');
    });
  });
});
