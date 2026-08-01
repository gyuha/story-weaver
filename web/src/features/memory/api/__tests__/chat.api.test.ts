import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatStream } from '../chat.api';

// task #66 — 작품 챗은 지금까지 취소가 불가능했다(stop 미노출). 훅이 stop을 노출하고
// 호출 시 진행 중 요청이 실제로 abort되는지 고정한다. 이게 없으면 중단 버튼을 붙여도
// SSE 생성이 끝까지 돌아 토큰이 계속 탄다.

describe('useChatStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stop을 노출한다 — useAssistStream과 같은 모양', () => {
    const { result } = renderHook(() => useChatStream());
    expect(typeof result.current.stop).toBe('function');
  });

  it('stop()은 진행 중인 fetch를 abort한다', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedSignal = (init as RequestInit | undefined)?.signal ?? undefined;
      // 스트림이 끝나지 않게 붙잡아 둔다 — abort 여부만 본다.
      return new Promise(() => {}) as Promise<Response>;
    });

    const { result } = renderHook(() => useChatStream());

    act(() => {
      void result.current.start({
        workId: 'w1',
        payload: { content: '질문', chapterId: 'c1' },
      });
    });
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    act(() => {
      result.current.stop();
    });
    expect(capturedSignal?.aborted).toBe(true);
  });
});
