import { describe, expect, it } from 'vitest';
import { parseSseTextStream } from '../assist.api';

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
