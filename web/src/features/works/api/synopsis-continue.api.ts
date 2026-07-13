// 기획의도 AI 이어쓰기(task #53) SSE 스트리밍 — editor/api/assist.api.ts의
// streamAssist/useAssistStream, memory/api/chat.api.ts의 streamChatMessage와 동일 패턴을
// 이 엔드포인트 하나에 맞춰 자기완결적으로 미러링한다(파일 공유 없음 — 도메인 자기완결).
import type { SynopsisContinueRequest } from '@/api';
import { getAccessToken, useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';
import { useCallback, useRef, useState } from 'react';

// eco: prod 오리진 주입은 assist.api.ts와 동일하게 VITE_API_BASE_URL을 직접 읽는다.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function synopsisContinueUrl(workId: string): string {
  return `${API_BASE}/api/v1/works/${workId}/synopsis/continue`;
}

/** ReadableStream<Uint8Array>를 디코딩된 텍스트 청크의 async iterable로 변환. */
async function* toTextChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * SSE 원문 텍스트 스트림을 파싱해 `data:` 청크를 순서대로 yield 한다.
 * assist.api.ts의 parseSseTextStream과 동일 로직(같은 SSE 백엔드 와이어 포맷 공유).
 */
export async function* parseSseTextStream(source: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = '';
  for await (const raw of source) {
    buffer += raw.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const lines = block.split('\n');
      const isError = lines.some(
        (line) => line.startsWith('event:') && line.slice(6).trim() === 'error'
      );
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');

      if (data) {
        if (isError) throw new Error(data);
        if (data === '[DONE]') return;
        yield data;
      }

      boundary = buffer.indexOf('\n\n');
    }
  }
}

export interface StreamSynopsisContinueParams {
  workId: string;
  payload: SynopsisContinueRequest;
}

/**
 * 기획의도 AI 이어쓰기 SSE 엔드포인트를 호출하고 텍스트 청크 스트림을 yield 한다.
 * 401 처리는 assist.api.ts의 streamAssist와 동일 정책(단일-비행 refresh 후 1회 재시도,
 * 재실패 시 세션 클리어 + `/auth/login` 이동).
 */
export async function* streamSynopsisContinue(
  params: StreamSynopsisContinueParams,
  init?: { signal?: AbortSignal }
): AsyncGenerator<string> {
  const { workId, payload } = params;

  const fetchWithToken = (token: string | null) =>
    fetch(synopsisContinueUrl(workId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: init?.signal,
    });

  let res = await fetchWithToken(getAccessToken());

  if (res.status === 401) {
    let newToken: string;
    try {
      newToken = await refreshAccessToken();
    } catch {
      window.location.href = '/auth/login';
      throw new Error(`synopsis continue stream failed: ${res.status}`);
    }

    res = await fetchWithToken(newToken);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      throw new Error(`synopsis continue stream failed: ${res.status}`);
    }
  }

  if (!res.ok || !res.body) {
    throw new Error(`synopsis continue stream failed: ${res.status}`);
  }

  yield* parseSseTextStream(toTextChunks(res.body));
}

/**
 * 기획의도 AI 이어쓰기 SSE 스트림을 소비하는 훅 — useAssistStream/useChatStream과 동일
 * 모양({ start, text, isStreaming, error }).
 */
export function useSynopsisContinueStream() {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (params: StreamSynopsisContinueParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText('');
    setError(null);
    setIsStreaming(true);
    try {
      const stream = streamSynopsisContinue(params, { signal: controller.signal });
      for await (const chunk of stream) {
        setText((prev) => prev + chunk);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err as Error);
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { start, text, isStreaming, error };
}
