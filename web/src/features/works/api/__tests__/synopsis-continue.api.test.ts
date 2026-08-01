import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSynopsisContinueStream } from '../synopsis-continue.api';

// task #65 — 훅이 stop을 노출하고, 호출 시 진행 중인 요청이 실제로 abort되는지.
// stop이 없으면 취소해도 SSE 생성이 끝까지 돌아 토큰이 계속 탄다.

describe('useSynopsisContinueStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stop을 노출한다 — useAssistStream과 같은 모양', () => {
    const { result } = renderHook(() => useSynopsisContinueStream());
    expect(typeof result.current.stop).toBe('function');
  });

  it('stop()은 진행 중인 fetch를 abort한다', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedSignal = (init as RequestInit | undefined)?.signal ?? undefined;
      // 스트림이 끝나지 않게 붙잡아 둔다 — abort 여부만 본다.
      return new Promise(() => {}) as Promise<Response>;
    });

    const { result } = renderHook(() => useSynopsisContinueStream());

    act(() => {
      void result.current.start({ workId: 'w1', payload: { text: '이 작품은' } });
    });
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    act(() => {
      result.current.stop();
    });
    expect(capturedSignal?.aborted).toBe(true);
  });
});
