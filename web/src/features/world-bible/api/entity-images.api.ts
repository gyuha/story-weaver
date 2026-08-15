// world-bible(설정 이미지: 화풍 조회·목록·생성 SSE·대표 지정·시각 묘사 수정) 도메인 API facade.
// 목록/화풍/PATCH는 다른 facade(world-bible.api.ts)와 동일하게 생성 SDK(@/api)를 감싼다.
// 생성(POST .../images)은 SSE라 axios 클라이언트로 스트리밍을 다루지 않으므로
// editor/api/assist.api.ts와 동일 패턴(fetch 직접 호출 + 401 단일-비행 refresh 재시도)을
// 이 엔드포인트에 맞춰 자기완결적으로 미러링한다(파일 공유 없음 — synopsis-continue.api.ts와 동일 방식).
import {
  type UpdateEntityImageRequest,
  getApiV1ArtStyles,
  getApiV1WorksByWorkIdArtStyle,
  getApiV1WorksByWorkIdEntitiesByEntityIdImages,
  patchApiV1WorksByWorkIdImagesByImageId,
} from '@/api';
import { getAccessToken, useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';

export const imageGenerationApi = {
  /** 화풍 카탈로그(4개) — 카드 상세의 "이 작품의 화풍" 한 줄에 라벨을 붙이는 데 쓴다. */
  async artStyles() {
    const { data } = await getApiV1ArtStyles({ throwOnError: true });
    return data;
  },
  /** 이 작품에 적용된 화풍(미지정이면 artStyleId: null). */
  async workArtStyle(workId: string) {
    const { data } = await getApiV1WorksByWorkIdArtStyle({
      path: { work_id: workId },
      throwOnError: true,
    });
    return data;
  },
  async images(workId: string, entityId: string) {
    const { data } = await getApiV1WorksByWorkIdEntitiesByEntityIdImages({
      path: { work_id: workId, entity_id: entityId },
      throwOnError: true,
    });
    return data;
  },
  async updateImage(workId: string, imageId: string, body: UpdateEntityImageRequest) {
    const { data } = await patchApiV1WorksByWorkIdImagesByImageId({
      path: { work_id: workId, image_id: imageId },
      body,
      throwOnError: true,
    });
    return data;
  },
};

// eco: 백엔드가 돌려주는 imageUrl·sampleUrl은 host 없는 절대경로("/api/v1/...")다 —
// prod 오리진 주입은 lib/api-client.ts·assist.api.ts와 동일하게 VITE_API_BASE_URL을 붙인다.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * 백엔드가 돌려주는 host 없는 이미지 경로에 prod 오리진을 붙인다.
 *
 * **인증이 필요 없는 이미지에만 쓸 것** — 화풍 견본(`/api/v1/art-styles/…/samples/…`)이
 * 그렇다. 설정 이미지(`/api/v1/works/{id}/images/{id}`)는 테넌트 가드가 걸려 있어
 * 이 경로를 `<img src>`에 넣으면 **브라우저가 Authorization 헤더를 보낼 수 없어 401이
 * 나고 이미지가 깨진다**(실측: 인증 없이 401, 토큰 있으면 200 image/jpeg).
 * 그런 이미지는 {@link fetchImageObjectUrl}을 쓴다.
 */
export function apiImageSrc(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * 인증이 필요한 이미지 바이트를 토큰과 함께 받아 objectURL로 만든다.
 *
 * `<img>` 태그는 헤더를 실을 수 없으므로 테넌트 가드가 걸린 이미지는 이 경로로만 그릴 수
 * 있다. 401 정책은 {@link streamGenerateEntityImage}와 동일하다(단일-비행 refresh 후 1회
 * 재시도, 재실패 시 세션 클리어 + `/auth/login`).
 *
 * **호출부는 다 쓴 URL을 `URL.revokeObjectURL`로 해제해야 한다** — 안 하면 화면을 옮길
 * 때마다 blob이 쌓인다. `useAuthedImage` 훅이 그 해제를 대신한다.
 */
export async function fetchImageObjectUrl(
  path: string,
  init?: { signal?: AbortSignal }
): Promise<string> {
  const doFetch = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: init?.signal,
    });

  let res = await doFetch(getAccessToken());

  if (res.status === 401) {
    let newToken: string;
    try {
      newToken = await refreshAccessToken();
    } catch {
      window.location.href = '/auth/login';
      throw new Error('image fetch failed: 401');
    }
    res = await doFetch(newToken);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      throw new Error('image fetch failed: 401');
    }
  }

  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

function generateEntityImageUrl(workId: string, entityId: string): string {
  return `${API_BASE}/api/v1/works/${workId}/entities/${entityId}/images`;
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

export interface EntityImageSseEvent {
  event: 'stage' | 'image' | 'description' | 'error' | 'message';
  data: string;
}

/**
 * SSE 원문 텍스트 스트림을 event/data 쌍으로 순서대로 yield한다. `[DONE]`에서 종료한다.
 * assist.api.ts의 parseSseTextStream과 달리 이 엔드포인트는 event 이름(stage/image/description)이
 * 의미를 가지므로(image_generation_router.py의 _stream_entity_image_generation) 이름째 보존한다.
 */
export async function* parseEntityImageSseStream(
  source: AsyncIterable<string>
): AsyncGenerator<EntityImageSseEvent> {
  let buffer = '';
  for await (const raw of source) {
    buffer += raw.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const lines = block.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event:'));
      const event = (eventLine?.slice(6).trim() || 'message') as EntityImageSseEvent['event'];
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');

      if (data) {
        if (data === '[DONE]') return;
        yield { event, data };
      }

      boundary = buffer.indexOf('\n\n');
    }
  }
}

export interface GenerateEntityImageParams {
  workId: string;
  entityId: string;
  extraPrompt?: string;
}

/**
 * 설정 이미지 생성 SSE 호출. 401 처리는 assist.api.ts의 streamAssist와 동일 정책
 * (단일-비행 refresh 후 1회 재시도, 재실패 시 세션 클리어 + `/auth/login` 이동).
 */
export async function* streamGenerateEntityImage(
  params: GenerateEntityImageParams,
  init?: { signal?: AbortSignal }
): AsyncGenerator<EntityImageSseEvent> {
  const { workId, entityId, extraPrompt } = params;

  const fetchWithToken = (token: string | null) =>
    fetch(generateEntityImageUrl(workId, entityId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ extraPrompt }),
      signal: init?.signal,
    });

  let res = await fetchWithToken(getAccessToken());

  if (res.status === 401) {
    let newToken: string;
    try {
      newToken = await refreshAccessToken();
    } catch {
      window.location.href = '/auth/login';
      throw new Error(`entity image stream failed: ${res.status}`);
    }

    res = await fetchWithToken(newToken);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      throw new Error(`entity image stream failed: ${res.status}`);
    }
  }

  if (!res.ok || !res.body) {
    // 화풍 미지정 작품은 스트림을 시작하기 전에 409 + { detail } 로 거부된다(ADR 260813-110724).
    // 429(한도) 등 생성 중 오류와 달리 SSE로 오지 않으므로 여기서 detail을 읽어 그대로 던진다.
    if (res.status === 409) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail ?? '작품의 화풍이 정해지지 않았습니다.');
    }
    throw new Error(`entity image stream failed: ${res.status}`);
  }

  yield* parseEntityImageSseStream(toTextChunks(res.body));
}
