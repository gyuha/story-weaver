import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SuggestionPicker } from '../suggestion-picker';

describe('SuggestionPicker', () => {
  it('스트리밍 중에는 원문 blob과 생성 중 라벨을 보여주고 적용 버튼은 없다', () => {
    render(
      <SuggestionPicker
        rawText="1. 가는 중"
        isStreaming={true}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/생성 중/)).toBeInTheDocument();
    expect(screen.getByText('1. 가는 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
  });

  it('완료되면 후보별 카드와 적용 버튼을 렌더한다', () => {
    render(
      <SuggestionPicker
        rawText={'1. 가\n2. 나\n3. 다'}
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('가')).toBeInTheDocument();
    expect(screen.getByText('나')).toBeInTheDocument();
    expect(screen.getByText('다')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '적용' })).toHaveLength(3);
  });

  it('두 번째 카드의 적용을 클릭하면 해당 후보 텍스트로 onApply가 호출된다', async () => {
    const onApply = vi.fn();
    render(
      <SuggestionPicker
        rawText={'1. 가\n2. 나\n3. 다'}
        isStreaming={false}
        error={null}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    const applyButtons = screen.getAllByRole('button', { name: '적용' });
    await userEvent.click(applyButtons[1]);

    expect(onApply).toHaveBeenCalledWith('나');
  });

  it('취소를 클릭하면 onCancel이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <SuggestionPicker
        rawText={'1. 가\n2. 나'}
        isStreaming={false}
        error={null}
        onApply={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('에러가 있으면 에러 메시지를 표시한다', () => {
    render(
      <SuggestionPicker
        rawText=""
        isStreaming={false}
        error={new Error('LLM provider error')}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
  });
});
