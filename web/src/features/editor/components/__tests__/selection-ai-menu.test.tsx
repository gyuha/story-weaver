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
const stopSpy = vi.fn();
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
    return { start: startSpy, stop: stopSpy, ...state };
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
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    expect(startSpy).toHaveBeenCalledWith('style', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { text: SELECTED_TEXT, targetStyle: expect.any(String) },
    });
  });

  it('늘리기는 continue 태스크를 선택 텍스트를 cursorText로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '늘리기' }));

    expect(startSpy).toHaveBeenCalledWith('continue', {
      workId: 'w1',
      chapterId: 'ch1',
      payload: { cursorText: SELECTED_TEXT },
    });
  });

  it('줄이기는 style 태스크를 축약 지시로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '줄이기' }));

    const [taskType, params] = startSpy.mock.calls[0];
    expect(taskType).toBe('style');
    expect(params.payload.targetStyle).toMatch(/간결|축약/);
  });

  it('톤 변경은 style 태스크를 격식 지시로 호출한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '톤 변경' }));

    const [taskType, params] = startSpy.mock.calls[0];
    expect(taskType).toBe('style');
    expect(params.payload.targetStyle).toMatch(/격식|정중/);
  });
});

describe('SelectionAiMenu 모달 표시', () => {
  // 구 동작(선택 영역 아래 띄우는 팝오버)을 대체한다 — 화면 하단에서 잘려 후보를
  // 고를 수 없고, 팝오버가 본문 위에 떠 있어 편집도 방해했다. 이어쓰기와 같은 모달로 통일.

  it('액션을 누르면 모달로 열리고 헤더가 누른 액션을 가리킨다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '톤 변경' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('AI 톤 변경')).toBeInTheDocument();
  });

  it('선택 좌표를 계산하지 않는다 — 모달은 화면 중앙에 뜨므로 위치가 필요 없다', async () => {
    const coordsSpy = vi.fn(() => ({ top: 10, bottom: 20, left: 30 }));
    const editorWithSpy = { ...fakeEditor, view: { coordsAtPos: coordsSpy } };
    render(<SelectionAiMenu editor={editorWithSpy} workId="w1" chapterId="ch1" />);

    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    // 좌표 기반 배치가 하단 잘림의 원인이었다.
    expect(coordsSpy).not.toHaveBeenCalled();
  });

  it('취소하면 모달이 닫히고 스트림도 중단한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '줄이기' }));
    act(() => setMockAssistState({ isStreaming: true, text: '일부' }));

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('SelectionAiMenu 스트리밍 미리보기', () => {
  // 구 동작(원문 blob을 그대로 흘리기)을 대체 — 이어쓰기 모달과 연출을 통일했다.
  // 스트리밍 중엔 원문이 보이지 않고 스켈레톤만 있어야 한다.
  it('스트리밍 중에는 원문을 노출하지 않고 스켈레톤만 보여준다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '그가' }));
    expect(screen.queryByText('그가')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);

    act(() => setMockAssistState({ text: '그가 말했다' }));
    expect(screen.queryByText('그가 말했다')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);

    // 완료되면 후보 카드로 나타난다(style은 마커가 없어 후보 1개).
    act(() => setMockAssistState({ isStreaming: false }));
    expect(screen.getByText('그가 말했다')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });

  it('스트리밍 중에는 적용 버튼이 없고, 완료되면 나타나 적용할 수 있다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));

    act(() => setMockAssistState({ isStreaming: true, text: '그가' }));
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();

    act(() => setMockAssistState({ isStreaming: false, text: '그가 낮게 말했다' }));
    expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(insertContentAtSpy).toHaveBeenCalledWith({ from: 3, to: 8 }, '그가 낮게 말했다');
  });

  it('스트림 에러가 발생하면 에러 메시지를 화면에 표시하고 적용 버튼을 감춘다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '늘리기' }));

    act(() => setMockAssistState({ isStreaming: false, error: new Error('LLM provider error') }));

    expect(screen.getByText('LLM provider error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
  });
});

describe('SelectionAiMenu 닫기 시 스트림 중단', () => {
  it('취소를 누르면 스트림을 중단하고 팝오버를 닫는다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));
    act(() => setMockAssistState({ isStreaming: true, text: '그가' }));

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('적용을 누르면 스트림을 중단하고 선택 영역을 교체한다', async () => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: '다시쓰기' }));
    act(() => setMockAssistState({ isStreaming: false, text: '그가 낮게 말했다' }));

    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(insertContentAtSpy).toHaveBeenCalledWith({ from: 3, to: 8 }, '그가 낮게 말했다');
  });
});

describe('SelectionAiMenu 팝오버 헤더', () => {
  // 네 액션 모두 "AI 이어쓰기"가 뜨던 문제 — 헤더는 누른 액션을 가리켜야 한다.
  it.each([
    ['다시쓰기', 'AI 다시쓰기'],
    ['늘리기', 'AI 늘리기'],
    ['줄이기', 'AI 줄이기'],
    ['톤 변경', 'AI 톤 변경'],
  ])('%s를 누르면 헤더가 "%s"로 뜬다', async (action, header) => {
    render(<SelectionAiMenu editor={fakeEditor} workId="w1" chapterId="ch1" />);
    await userEvent.click(screen.getByRole('button', { name: action }));

    expect(screen.getByText(header, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('AI 이어쓰기', { exact: false })).not.toBeInTheDocument();
  });
});
