// 설정 이미지 생성 SSE 스트림을 소비하는 훅 — editor/api/assist.api.ts의 useAssistStream과
// 같은 모양({ start, cancel, ..., error })이나, 이 엔드포인트는 event 이름(stage/image/description)
// 자체가 의미를 가지므로 텍스트 누적이 아니라 단계별 콜백으로 소비한다.
import { useCallback, useRef, useState } from 'react';
import {
  type GenerateEntityImageParams,
  streamGenerateEntityImage,
} from '../api/entity-images.api';

export type EntityImageGenerationStage = 'prompt' | 'image' | 'description';

export interface UseGenerateEntityImageOptions {
  /** `event: image` 수신 시 호출 — 이미지가 이미 커밋됐으므로 목록을 갱신한다. */
  onImage: () => void;
  /** `event: description` 수신 시 호출 — 묘사가 채워졌으므로 목록을 갱신한다. */
  onDescription: () => void;
}

export function useGenerateEntityImage({ onImage, onDescription }: UseGenerateEntityImageOptions) {
  const [stage, setStage] = useState<EntityImageGenerationStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (params: GenerateEntityImageParams) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setStage('prompt');
      try {
        const stream = streamGenerateEntityImage(params, { signal: controller.signal });
        for await (const evt of stream) {
          if (evt.event === 'stage') setStage(evt.data as EntityImageGenerationStage);
          else if (evt.event === 'image') onImage();
          else if (evt.event === 'description') onDescription();
          else if (evt.event === 'error') setError(evt.data);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
      } finally {
        setStage(null);
      }
    },
    [onImage, onDescription]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { start, cancel, stage, isGenerating: stage !== null, error };
}
