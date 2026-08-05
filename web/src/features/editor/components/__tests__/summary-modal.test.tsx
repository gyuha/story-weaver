import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryModal } from '../summary-modal';

// 요약 모달은 **편집란 하나 + 직업 4개** 구조다(task #70). 저장된 요약이 textarea에
// 들어 있어 작가가 직접 고쳐 저장한다. `AI 요약` 결과도 편집란에 들어와 손본 뒤
// 저장하므로, 이전의 `done`(적용 대기) 단계가 없어졌다.
//   idle       → 편집 가능 + [AI 요약] [저장] [닫기]
//   generating → 편집란 비활성 + 스켈레톤 + [닫기]
// `늘려쓰기`(편집란 요약 → 본문 생성)는 part 3/3에서 붙었다. 대체 확인·본문 반영은
// 호출부(manuscript)의 책임이라, 모달은 편집란의 현재 값을 넘기는 것까지만 한다.

const base = {
  open: true,
  phase: 'idle' as const,
  error: null,
  onGenerate: vi.fn(),
  onDraft: vi.fn(),
  onSave: vi.fn(),
  onClose: vi.fn(),
};

const box = () => screen.getByRole('textbox', { name: '화 요약' });

describe('SummaryModal 편집', () => {
  it('저장된 요약이 편집란의 값으로 들어온다', () => {
    render(<SummaryModal {...base} existingSummary="주인공이 10년 전으로 돌아왔다." />);
    expect(box()).toHaveValue('주인공이 10년 전으로 돌아왔다.');
  });

  it('저장된 요약이 없으면 편집란이 비어 있다', () => {
    render(<SummaryModal {...base} existingSummary={undefined} />);
    expect(box()).toHaveValue('');
  });

  it('공백뿐인 요약도 없는 것으로 본다', () => {
    render(<SummaryModal {...base} existingSummary="   " />);
    expect(box()).toHaveValue('');
  });

  it('타이핑하면 값이 바뀐다', async () => {
    render(<SummaryModal {...base} existingSummary="원래 요약" />);
    await userEvent.clear(box());
    await userEvent.type(box(), '고친 요약');
    expect(box()).toHaveValue('고친 요약');
  });

  it('저장은 편집란의 현재 값으로 불린다', async () => {
    const onSave = vi.fn();
    render(<SummaryModal {...base} existingSummary="원래 요약" onSave={onSave} />);
    await userEvent.clear(box());
    await userEvent.type(box(), '고친 요약');

    await userEvent.click(screen.getByRole('button', { name: '요약 저장' }));

    expect(onSave).toHaveBeenCalledWith('고친 요약');
  });

  it('닫기는 저장하지 않는다', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <SummaryModal {...base} existingSummary="원래 요약" onSave={onSave} onClose={onClose} />
    );
    await userEvent.clear(box());
    await userEvent.type(box(), '버려질 편집');

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('늘려쓰기는 편집란의 현재 값으로 불린다', async () => {
    const onDraft = vi.fn();
    render(<SummaryModal {...base} existingSummary="원래 요약" onDraft={onDraft} />);
    await userEvent.clear(box());
    await userEvent.type(box(), '손본 요약');

    await userEvent.click(screen.getByRole('button', { name: '요약으로 본문 작성' }));

    expect(onDraft).toHaveBeenCalledWith('손본 요약');
  });

  it('AI 요약을 누르면 생성을 시작한다', async () => {
    const onGenerate = vi.fn();
    render(<SummaryModal {...base} existingSummary="원래 요약" onGenerate={onGenerate} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI로 본문 요약' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('SummaryModal 생성 중', () => {
  it('편집란이 비활성이고 AI 요약·저장을 누를 수 없다', () => {
    render(<SummaryModal {...base} existingSummary="원래 요약" phase="generating" />);

    expect(box()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'AI로 본문 요약' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '요약 저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '요약으로 본문 작성' })).toBeDisabled();
    // 중단할 수 있어야 한다.
    expect(screen.getByRole('button', { name: '닫기' })).toBeEnabled();
  });

  it('스켈레톤으로 진행을 알린다', () => {
    render(<SummaryModal {...base} existingSummary="원래 요약" phase="generating" />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});

describe('SummaryModal 외부 값 변경', () => {
  it('저장된 요약이 바뀌면 편집란이 새 값으로 초기화된다 — 다른 화로 옮긴 경우', () => {
    const { rerender } = render(<SummaryModal {...base} existingSummary="1화 요약" />);
    expect(box()).toHaveValue('1화 요약');

    rerender(<SummaryModal {...base} existingSummary="2화 요약" />);

    expect(box()).toHaveValue('2화 요약');
  });
});

describe('SummaryModal 에러', () => {
  it('에러 메시지를 보여주고 편집 내용을 건드리지 않는다', async () => {
    const { rerender } = render(<SummaryModal {...base} existingSummary="원래 요약" />);
    await userEvent.clear(box());
    await userEvent.type(box(), '내가 쓴 요약');

    rerender(<SummaryModal {...base} existingSummary="원래 요약" error={new Error('LLM 실패')} />);

    expect(screen.getByText('LLM 실패')).toBeInTheDocument();
    expect(box()).toHaveValue('내가 쓴 요약');
  });
});
