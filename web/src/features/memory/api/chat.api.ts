// chat(작품 단위 채팅) 도메인 API facade — 생성 SDK(@/api)를 감싼다.
// GET 대화/이력 조회·POST 새 대화 생성은 works.api.ts/memory.api.ts와 동일 패턴(직접 호출
// 함수는 throwOnError: true로 성공 데이터만 반환, Query/Mutation option은 도메인 이름으로 재노출).
// POST /messages는 SSE(text/event-stream) 응답이라 생성 SDK로 다루지 않는다 — axios 클라이언트가
// 스트리밍 바디를 다루지 않으므로, editor/api/assist.api.ts의 streamAssist/useAssistStream과
// 동일 패턴(fetch 직접 호출 + 401 단일-비행 refresh 재시도)을 이 파일 안에 그대로 미러링한다.
import type {
  GetApiV1WorksByWorkIdChatConversationData,
  GetApiV1WorksByWorkIdChatConversationMessagesData,
  Options,
  PostApiV1WorksByWorkIdChatConversationsData,
  SendWorkChatMessageRequest,
} from '@/api';
import {
  getApiV1WorksByWorkIdChatConversation,
  getApiV1WorksByWorkIdChatConversationMessages,
  postApiV1WorksByWorkIdChatConversations,
} from '@/api';
import {
  getApiV1WorksByWorkIdChatConversationMessagesOptions,
  getApiV1WorksByWorkIdChatConversationOptions,
  postApiV1WorksByWorkIdChatConversationsMutation,
} from '@/api/@tanstack/react-query.gen';
import { getAccessToken, useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';
import { useCallback, useRef, useState } from 'react';

export const chatApi = {
  async getConversation(options: Options<GetApiV1WorksByWorkIdChatConversationData>) {
    const { data } = await getApiV1WorksByWorkIdChatConversation({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async getMessages(options: Options<GetApiV1WorksByWorkIdChatConversationMessagesData>) {
    const { data } = await getApiV1WorksByWorkIdChatConversationMessages({
      ...options,
      throwOnError: true,
    });
    return data;
  },
  async startNewConversation(options: Options<PostApiV1WorksByWorkIdChatConversationsData>) {
    const { data } = await postApiV1WorksByWorkIdChatConversations({
      ...options,
      throwOnError: true,
    });
    return data;
  },
};

export const chatQueries = {
  conversation: getApiV1WorksByWorkIdChatConversationOptions,
  messages: getApiV1WorksByWorkIdChatConversationMessagesOptions,
};

export const chatMutations = {
  startNewConversation: postApiV1WorksByWorkIdChatConversationsMutation,
};

// eco: prod 오리진 주입은 assist.api.ts와 동일하게 VITE_API_BASE_URL을 직접 읽는다
// (axios client를 거치지 않으므로 별도 상수로 중복 정의).
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function chatMessagesUrl(workId: string): string {
  return `${API_BASE}/api/v1/works/${workId}/chat/messages`;
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
 * assist.api.ts의 parseSseTextStream과 동일 로직(와이어 포맷이 같은 SSE 백엔드를 공유).
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

export interface StreamChatMessageParams {
  workId: string;
  payload: SendWorkChatMessageRequest;
}

/**
 * 작품 채팅 메시지 SSE 엔드포인트를 호출하고 텍스트 청크 스트림을 yield 한다.
 * 401 처리는 assist.api.ts의 streamAssist와 동일 정책(단일-비행 refresh 후 1회 재시도,
 * 재실패 시 세션 클리어 + `/auth/login` 이동).
 */
export async function* streamChatMessage(
  params: StreamChatMessageParams,
  init?: { signal?: AbortSignal }
): AsyncGenerator<string> {
  const { workId, payload } = params;

  const fetchWithToken = (token: string | null) =>
    fetch(chatMessagesUrl(workId), {
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
      throw new Error(`chat stream failed: ${res.status}`);
    }

    res = await fetchWithToken(newToken);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      throw new Error(`chat stream failed: ${res.status}`);
    }
  }

  if (!res.ok || !res.body) {
    throw new Error(`chat stream failed: ${res.status}`);
  }

  yield* parseSseTextStream(toTextChunks(res.body));
}

/**
 * 작품 채팅 SSE 스트림을 소비하는 공용 훅 — assist.api.ts의 useAssistStream과 동일 모양
 * ({ start, stop, text, isStreaming, error })이다. `start`로 메시지를 보내면 `text`가
 * 토큰 도착마다 점진적으로 채워진다.
 *
 * `stop`은 중단 시 **반드시** 호출해야 한다. 부르지 않으면 SSE 생성이 끝까지 돌아
 * 토큰이 계속 탄다(내부 AbortController는 다음 `start()` 때야 abort된다). 서버는 중단을
 * 감지해 부분 응답을 `finish_reason='cancelled'`로 저장하고 받은 분량을 사용량 한도에
 * 반영한다(ADR `260801-014029`).
 */
export function useChatStream() {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (params: StreamChatMessageParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText('');
    setError(null);
    setIsStreaming(true);
    try {
      const stream = streamChatMessage(params, { signal: controller.signal });
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

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { start, stop, text, isStreaming, error };
}
