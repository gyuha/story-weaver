import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- mocks ---

// BubbleMenu는 실제 ProseMirror 셀렉션·floating-ui 포지셔닝에 의존한다 — 버튼 클릭
// 동작만 검증하면 되므로 항상 children을 그리는 컨테이너로 대체한다.
vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

const startSpy = vi.fn();
interface MockAssistState {
  text: string;
  isStreaming: boolean;
  error: Error | null;
}
let setMockAssistState: (patch: Partial<MockAssistState>) => void = () => {};

vi.mock('@/features/editor/api/assist.api', () => ({
  useAssistStream: () => {
    const [state, setState] = useState<MockAssistState>({
      text: '',
      isStreaming: false,
      error: null,
    });
    setMockAssistState = (patch) => setState((s) => ({ ...s, ...patch }));
    return { start: startSpy, ...state };
  },
}));

import { SelectionAiMenu } from '../selection-ai-menu';

const SELECTED_TEXT = '그는 조용히 고개를 끄덕였다.';
const runSpy = vi.fn();
const insertContentAtSpy = vi.fn();
const chain = {
  focus: () => chain,
  insertContentAt: (...args: unknown[]) => {
    insertContentAtSpy(...args);
    return chain;
  },
  run: () => runSpy(),
};
const fakeEditor = {
  state: {
    selection: { from: 3, to: 8 },
    doc: { textBetween: () => SELECTED_TEXT },
  },
  view: { coordsAtPos: () => ({ top: 10, bottom: 20, left: 30 }) },
  chain: () => chain,
  // biome-ignore lint/suspicious/noExplicitAny: 테스트용 최소 fake editor
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  setMockAssistState = () => {};
});

describe('SelectionAiMenu 액션 → 태스크 매핑', () => {
  it('다시쓰기는 style 태스크를 선택 텍스트+재작성 지시로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    expect(startSpy).toHaveBeenCalledWith('style', {
      workId: 'w1',
      sceneId: 'sc1',
      payload: { text: SELECTED_TEXT, targetStyle: expect.any(String) },
    });
  });

  it('늘리기는 continue 태스크를 선택 텍스트를 cursorText로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '늘리기' }));

    expect(startSpy).toHaveBeenCalledWith('continue', {
      workId: 'w1',
      sceneId: 'sc1',
      payload: { cursorText: SELECTED_TEXT },
    });
  });

  it('줄이기는 style 태스크를 축약 지시로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '줄이기' }));

    const [taskType, params] = startSpy.mock.calls[0];
    expect(taskType).toBe('style');
    expect(params.payload.targetStyle).toMatch(/간결|축약/);
  });

  it('톤 변경은 style 태스크를 격식 지시로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '톤 변경' }));

    const [taskType, params] = startSpy.mock.calls[0];
    expect(taskType).toBe('style');
    expect(params.payload.targetStyle).toMatch(/격식|정중/);
  });
});

describe('SelectionAiMenu 스트리밍 미리보기', () => {
  it('스트림 청크가 도착하는 대로 미리보기에 점진적으로 반영된다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '그가' }));
    expect(screen.getByText('그가')).toBeInTheDocument();

    act(() => setMockAssistState({ text: '그가 말했다' }));
    expect(screen.getByText('그가 말했다')).toBeInTheDocument();
    expect(screen.queryByText('그가')).not.toBeInTheDocument();
  });

  it('스트리밍 중에는 적용 버튼이 없고, 완료되면 나타나 적용할 수 있다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '그가' }));
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();

    act(() => setMockAssistState({ isStreaming: false, text: '그가 낮게 말했다' }));
    expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(insertContentAtSpy).toHaveBeenCalledWith({ from: 3, to: 8 }, '그가 낮게 말했다');
  });

  it('스트림 에러가 발생하면 에러 메시지를 화면에 표시하고 적용 버튼을 감춘다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" sceneId="sc1" />);
    await userEvent.click(screen.getByRole('button', { name: '늘리기' }));

    act(() => setMockAssistState({ isStreaming: false, error: new Error('LLM provider error') }));

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
  });
});
