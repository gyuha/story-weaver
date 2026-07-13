import { useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSseTextStream, streamAssist } from '../assist.api';

// eco: assist.api.ts는 refreshAccessToken(단일-비행 coordinator)에 위임할 뿐이므로
// 여기서는 그 결과(성공/실패)만 모킹해 401 처리 분기를 검증한다.
vi.mock('@/lib/api-interceptors', () => ({
  refreshAccessToken: vi.fn(),
}));

// eco: 실 네트워크 스트림은 여기서 테스트하지 않는다 — fetch(ReadableStream)을 흉내 낸
// 문자열 청크 스트림만으로 SSE 파싱 로직(청크 경계, [DONE] 종료, 에러 이벤트)을 검증한다.
async function* fromChunks(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe('parseSseTextStream', () => {
  it('한 이벤트당 한 줄인 data: 라인을 텍스트 청크로 yield 하고 [DONE]에서 멈춘다', async () => {
    const chunks = await collect(
      parseSseTextStream(fromChunks(['data: 안녕\n\n', 'data: 세계\n\n', 'data: [DONE]\n\n']))
    );
    expect(chunks).toEqual(['안녕', '세계']);
  });

  it('네트워크 경계에서 data: 라인이 임의로 쪼개져도 올바르게 합쳐 yield 한다', async () => {
    const chunks = await collect(
      parseSseTextStream(fromChunks(['da', 'ta: hel', 'lo\n\ndata: wor', 'ld\n\ndata: [DONE]\n\n']))
    );
    expect(chunks).toEqual(['hello', 'world']);
  });

  it('sse_starlette 기본 구분자(\\r\\n)로 온 이벤트도 파싱한다', async () => {
    const chunks = await collect(
      parseSseTextStream(fromChunks(['data: hello\r\n\r\n', 'data: [DONE]\r\n\r\n']))
    );
    expect(chunks).toEqual(['hello']);
  });

  it('한 이벤트 안의 여러 data: 라인은 줄바꿈으로 합쳐 하나의 청크로 yield 한다', async () => {
    const chunks = await collect(
      parseSseTextStream(fromChunks(['data: line1\ndata: line2\n\n', 'data: [DONE]\n\n']))
    );
    expect(chunks).toEqual(['line1\nline2']);
  });

  it('[DONE] 이후에는 더 이상 소비하지 않고 즉시 종료한다', async () => {
    const gen = parseSseTextStream(fromChunks(['data: a\n\n', 'data: [DONE]\n\n', 'data: b\n\n']));
    const chunks = await collect(gen);
    expect(chunks).toEqual(['a']);
  });

  it('event: error 이벤트를 만나면 그 데이터를 메시지로 던진다', async () => {
    await expect(
      collect(parseSseTextStream(fromChunks(['event: error\ndata: LLM provider error\n\n'])))
    ).rejects.toThrow('LLM provider error');
  });
});

// eco: fetch가 반환하는 최소한의 Response 모양만 흉내 낸다(res.ok/status/body만 사용).
function sseResponse(text: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, body: null } as Response;
}

describe('streamAssist의 401 처리 (단일-비행 refresh 후 1회 재시도)', () => {
  const params = {
    workId: 'work-1',
    sceneId: 'scene-1',
    taskType: 'continue' as const,
    payload: { cursorText: '이어쓸 문장' },
  };

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: 'old-token',
      refreshToken: 'ref-token',
      user: null,
      isAuthenticated: true,
    });
    vi.mocked(refreshAccessToken).mockReset();
    // eco: jsdom의 실제 navigation을 막고 리다이렉트 여부만 관찰한다(이 저장소에 기존 관례 없음).
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  it('① 첫 fetch 401 → refresh 성공 → 새 Authorization으로 재시도해 정상 스트리밍한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(sseResponse('data: hello\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshAccessToken).mockResolvedValue('new-token');

    const chunks = await collect(streamAssist(params));

    expect(chunks).toEqual(['hello']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
    expect(window.location.href).toBe('');
  });

  it('② refresh 실패 → 세션 클리어 + /auth/login 이동, 재시도 없음', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('refresh failed'));

    await expect(collect(streamAssist(params))).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/auth/login');
  });

  it('③ 재시도 후에도 401 → 세션 클리어 + /auth/login 이동, 추가 재시도 없음(fetch 총 2회)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(errorResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshAccessToken).mockResolvedValue('new-token');

    await expect(collect(streamAssist(params))).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(window.location.href).toBe('/auth/login');
  });
});
