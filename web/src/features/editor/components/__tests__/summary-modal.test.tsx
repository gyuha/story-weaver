import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryModal } from '../summary-modal';

// 요약 모달은 후보 피커와 모양이 다르다 — 후보 여러 장이 아니라 요약 한 덩어리를
// 보여주고, "기존 요약을 먼저 보여준다"는 단계가 앞에 있다. 상태 4개:
//   기존 요약 있음 → [다시 요약] [닫기]
//   기존 요약 없음 → 빈 상자 + [요약] [닫기]
//   생성 중        → 스켈레톤 + [닫기]
//   생성 완료(미저장) → 새 요약 + [적용] [닫기]

const base = {
  open: true,
  generatedText: '',
  phase: 'idle' as const,
  error: null,
  onGenerate: vi.fn(),
  onApply: vi.fn(),
  onClose: vi.fn(),
};

describe('SummaryModal 기존 요약 있음', () => {
  it('저장된 요약을 보여주고 다시 요약·닫기를 낸다', () => {
    render(<SummaryModal {...base} existingSummary="주인공이 10년 전으로 돌아왔다." />);

    expect(screen.getByText('주인공이 10년 전으로 돌아왔다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 요약' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
    // 아직 생성하지 않았으므로 적용할 것이 없다.
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
  });

  it('다시 요약을 누르면 생성을 시작한다', async () => {
    const onGenerate = vi.fn();
    render(<SummaryModal {...base} existingSummary="기존 요약" onGenerate={onGenerate} />);

    await userEvent.click(screen.getByRole('button', { name: '다시 요약' }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('SummaryModal 기존 요약 없음', () => {
  it('요약 자리를 빈 상자로 두고 요약·닫기를 낸다', () => {
    render(<SummaryModal {...base} existingSummary={undefined} />);

    // "요약 없음" 같은 라벨이 아니라, 내용이 비어 있는 것처럼 보여야 한다.
    const box = screen.getByTestId('summary-body');
    expect(box).toBeInTheDocument();
    expect(box.textContent).toBe('');

    expect(screen.getByRole('button', { name: '요약' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 요약' })).not.toBeInTheDocument();
  });

  it('빈 문자열로 저장된 요약도 없는 것으로 본다', () => {
    render(<SummaryModal {...base} existingSummary="   " />);
    expect(screen.getByRole('button', { name: '요약' })).toBeInTheDocument();
    expect(screen.getByTestId('summary-body').textContent).toBe('');
  });
});

describe('SummaryModal 생성 중', () => {
  it('스켈레톤만 보이고 생성·적용 버튼은 없다', () => {
    render(<SummaryModal {...base} existingSummary="기존 요약" phase="generating" />);

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 요약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
    // 생성 중에는 기존 요약도 노출하지 않는다 — 새 결과가 올 자리다.
    expect(screen.queryByText('기존 요약')).not.toBeInTheDocument();
  });
});

describe('SummaryModal 생성 완료', () => {
  it('새 요약과 적용·닫기를 낸다 — 아직 저장되지 않았다', () => {
    render(
      <SummaryModal
        {...base}
        existingSummary="기존 요약"
        phase="done"
        generatedText="새로 뽑은 요약."
      />
    );

    expect(screen.getByText('새로 뽑은 요약.')).toBeInTheDocument();
    expect(screen.queryByText('기존 요약')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('적용을 누르면 생성된 텍스트로 onApply를 부른다', async () => {
    const onApply = vi.fn();
    render(
      <SummaryModal {...base} phase="done" generatedText="새로 뽑은 요약." onApply={onApply} />
    );

    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(onApply).toHaveBeenCalledWith('새로 뽑은 요약.');
  });

  it('닫기를 누르면 저장하지 않고 onClose만 부른다', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <SummaryModal
        {...base}
        phase="done"
        generatedText="새로 뽑은 요약."
        onApply={onApply}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('SummaryModal 에러', () => {
  it('에러 메시지를 보여주고 다시 시도할 수 있게 한다', () => {
    render(<SummaryModal {...base} existingSummary="기존 요약" error={new Error('LLM 실패')} />);

    expect(screen.getByText('LLM 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 요약' })).toBeInTheDocument();
  });
});
