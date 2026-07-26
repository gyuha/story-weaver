import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { KeywordTagInput } from '../keyword-tag-input';

function setup(props?: Partial<React.ComponentProps<typeof KeywordTagInput>>) {
  const onChange = vi.fn();
  render(
    <KeywordTagInput tags={props?.tags ?? []} onChange={onChange} reserved={props?.reserved} />
  );
  return { onChange };
}

describe('KeywordTagInput', () => {
  it('Enter를 누르면 입력값이 태그로 추가된다', async () => {
    const { onChange } = setup({ tags: ['성장'] });

    await userEvent.type(screen.getByPlaceholderText('키워드를 입력하고 Enter'), '복수극{Enter}');

    expect(onChange).toHaveBeenCalledWith(['성장', '복수극']);
  });

  it('쉼표를 입력하면 입력값이 태그로 추가된다', async () => {
    const { onChange } = setup({ tags: [] });

    await userEvent.type(screen.getByPlaceholderText('키워드를 입력하고 Enter'), '  힐링  ,');

    expect(onChange).toHaveBeenCalledWith(['힐링']);
  });

  it('대소문자만 다른 중복이나 reserved와 겹치는 값은 추가하지 않는다', async () => {
    const { onChange } = setup({ tags: ['SF'], reserved: ['회귀 / 환생'] });
    const input = screen.getByPlaceholderText('키워드를 입력하고 Enter');

    await userEvent.type(input, 'sf{Enter}');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(input, '회귀 / 환생{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('칩의 삭제 버튼을 누르면 해당 태그가 제거된다', async () => {
    const { onChange } = setup({ tags: ['성장', '복수극'] });

    await userEvent.click(screen.getByRole('button', { name: '성장 삭제' }));

    expect(onChange).toHaveBeenCalledWith(['복수극']);
  });

  it('입력창이 빈 상태에서 Backspace를 누르면 마지막 태그가 제거된다', async () => {
    const { onChange } = setup({ tags: ['성장', '복수극'] });

    await userEvent.type(screen.getByPlaceholderText('키워드를 입력하고 Enter'), '{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['성장']);
  });

  // 한글 IME 회귀: 조합 중의 Enter로 커밋하면 확정 후 남는 마지막 음절이 두 번째 태그로 새어 나온다
  // ('먼치킨' → '먼치킨' + '킨'). jsdom은 실제 조합 버퍼를 재현하지 못하므로 근본 원인인
  // isComposing 가드를 고정한다 — 브라우저 육안 확인이 최종 검증.
  it('IME 조합 중의 Enter는 커밋하지 않고, 조합이 끝난 Enter만 한 번 커밋한다', async () => {
    const { onChange } = setup({ tags: [] });
    const input = screen.getByPlaceholderText('키워드를 입력하고 Enter');

    await userEvent.type(input, '먼치킨');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['먼치킨']);
  });

  it('IME 조합 중의 Backspace는 태그를 지우지 않는다 (자모 삭제)', () => {
    const { onChange } = setup({ tags: ['성장'] });

    fireEvent.keyDown(screen.getByPlaceholderText('키워드를 입력하고 Enter'), {
      key: 'Backspace',
      isComposing: true,
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
