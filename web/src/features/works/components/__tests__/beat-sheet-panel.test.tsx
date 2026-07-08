import type { BeatSheetResponse } from '@/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateBeatSheet = vi.fn();
vi.mock('@/features/works/api/plot.api', () => ({
  plotApi: {
    generateBeatSheet: (...args: unknown[]) => mockGenerateBeatSheet(...args),
  },
}));

import { BeatSheetPanel } from '../beat-sheet-panel';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BeatSheetPanel', () => {
  it('생성 버튼을 누르면 로딩 상태를 보여준 뒤 반환된 비트를 렌더링한다', async () => {
    let resolvePromise: (value: BeatSheetResponse) => void = () => {};
    mockGenerateBeatSheet.mockImplementation(
      () =>
        new Promise<BeatSheetResponse>((resolve) => {
          resolvePromise = resolve;
        })
    );

    render(<BeatSheetPanel workId="w1" />);
    await userEvent.click(screen.getByRole('button', { name: '비트 시트 생성' }));

    expect(mockGenerateBeatSheet).toHaveBeenCalledWith({ path: { work_id: 'w1' } });
    expect(screen.getByRole('button', { name: '생성 중…' })).toBeDisabled();

    resolvePromise({ beats: ['1화: 발단 — 주인공, 회귀 직후 각성', '2화: 전개 — 첫 위기'] });

    await waitFor(() => {
      expect(screen.getByText('1화: 발단 — 주인공, 회귀 직후 각성')).toBeInTheDocument();
    });
    expect(screen.getByText('2화: 전개 — 첫 위기')).toBeInTheDocument();
  });

  it('생성이 실패하면 에러 메시지를 화면에 표시한다', async () => {
    mockGenerateBeatSheet.mockRejectedValue({
      response: { data: { detail: '비트 시트 생성 한도를 초과했습니다.' } },
    });

    render(<BeatSheetPanel workId="w1" />);
    await userEvent.click(screen.getByRole('button', { name: '비트 시트 생성' }));

    await waitFor(() => {
      expect(screen.getByText('비트 시트 생성 한도를 초과했습니다.')).toBeInTheDocument();
    });
  });
});
