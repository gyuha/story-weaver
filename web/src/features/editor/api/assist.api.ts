import type {
  ContinueRequest,
  CorrectRequest,
  DialogueRequest,
  InfillRequest,
  StyleRequest,
} from '@/api';
import { getAccessToken, useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';
// editor(집필 보조: 이어쓰기·인필링·대사변환·문체변환·교정) 도메인 API facade.
// 5개 엔드포인트 모두 SSE(text/event-stream) 응답이라 생성 SDK(@/api) 함수를 그대로
// 쓰지 않는다 — axios 클라이언트는 스트리밍 바디를 다루지 않으므로 fetch를 직접 호출하고,
// 요청 바디 타입만 생성 타입(ContinueRequest 등)을 재사용한다.
// 와이어 포맷은 백엔드 assist_router.py가 chat_router.py의 SSE 패턴을 그대로 미러링한 것 —
// sse_starlette EventSourceResponse: 이벤트당 `data: <chunk>\r\n\r\n`, 종료 시
// `data: [DONE]\r\n\r\n`, 실패 시 `event: error\r\ndata: <message>\r\n\r\n`.
import { useCallback, useRef, useState } from 'react';

export type AssistTaskType = 'continue' | 'infill' | 'dialogue' | 'style' | 'correct';

type AssistPayloadMap = {
  continue: ContinueRequest;
  infill: InfillRequest;
  dialogue: DialogueRequest;
  style: StyleRequest;
  correct: CorrectRequest;
};

export type AssistPayload<T extends AssistTaskType> = AssistPayloadMap[T];

// eco: prod 오리진 주입은 lib/api-client.ts와 동일하게 VITE_API_BASE_URL을 직접 읽는다
// (axios client를 거치지 않으므로 별도 상수로 중복 정의).
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function assistUrl(workId: string, chapterId: string, taskType: AssistTaskType): string {
  return `${API_BASE}/api/v1/works/${workId}/chapters/${chapterId}/assist/${taskType}`;
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
 * `[DONE]` sentinel에서 종료하고, `event: error` 이벤트는 Error로 throw 한다.
 * 네트워크 경계에서 이벤트가 임의로 쪼개져도(버퍼링) 올바르게 합친다.
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

interface StreamAssistParams<T extends AssistTaskType> {
  workId: string;
  chapterId: string;
  taskType: T;
  payload: AssistPayload<T>;
}

/**
 * 집필 보조 SSE 엔드포인트를 호출하고 텍스트 청크 스트림을 yield 한다.
 * SSE 스트리밍 때문에 axios 인터셉터를 우회하므로, 401 응답은 여기서 axios 인터셉터와
 * 동일한 정책(api-interceptors.ts)으로 직접 처리한다: 단일-비행 refresh 후 1회 재시도,
 * 재실패(재401·refresh 실패) 시 세션 클리어 + `/auth/login` 이동.
 */
export async function* streamAssist<T extends AssistTaskType>(
  params: StreamAssistParams<T>,
  init?: { signal?: AbortSignal }
): AsyncGenerator<string> {
  const { workId, chapterId, taskType, payload } = params;

  const fetchWithToken = (token: string | null) =>
    fetch(assistUrl(workId, chapterId, taskType), {
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
      // coordinator.refresh()가 실패 시 이미 세션을 초기화하므로 여기서는 이동만 한다.
      window.location.href = '/auth/login';
      throw new Error(`assist stream failed: ${res.status}`);
    }

    res = await fetchWithToken(newToken);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      throw new Error(`assist stream failed: ${res.status}`);
    }
  }

  if (!res.ok || !res.body) {
    throw new Error(`assist stream failed: ${res.status}`);
  }

  yield* parseSseTextStream(toTextChunks(res.body));
}

export interface AssistStartParams<T extends AssistTaskType> {
  workId: string;
  chapterId: string;
  payload: AssistPayload<T>;
}

/**
 * 집필 보조 SSE 스트림을 소비하는 공용 훅. `start`로 작업을 시작하면 `text`가
 * 토큰 도착마다 점진적으로 채워진다. S2(selection-ai-menu)·S3(이어쓰기 인라인 제안)가
 * 이 훅 하나로 스트림 파싱 로직 중복 없이 소비한다.
 */
export function useAssistStream() {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async <T extends AssistTaskType>(taskType: T, params: AssistStartParams<T>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setText('');
      setError(null);
      setIsStreaming(true);
      try {
        const stream = streamAssist({ ...params, taskType }, { signal: controller.signal });
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
    },
    []
  );

  return { start, text, isStreaming, error };
}
