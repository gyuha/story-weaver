// 카드의 설정 이미지 목록 조회 — entity-image-section.tsx가 쓰고, entity-detail.tsx의
// 58×58 아바타도 같은 훅으로 대표 이미지를 얻어 공유한다(중복 조회 없음, 같은 queryKey로 dedupe).
// entity-list.tsx(18×18)도 대표 이미지를 반영해야 하나(plan.md S5), 그 파일은 이번 작업
// 범위 밖이라(로컬 imageUrl 병합 철거가 별도 작업 중) 이 훅을 그대로 재사용하도록 남겨둔다.
import { useQuery } from '@tanstack/react-query';
import { imageGenerationApi } from '../api/entity-images.api';

export function entityImagesQueryKey(workId: string, entityId: string) {
  return ['entity-images', workId, entityId] as const;
}

export function useEntityImages(workId: string, entityId: string) {
  const { data, isPending } = useQuery({
    queryKey: entityImagesQueryKey(workId, entityId),
    queryFn: () => imageGenerationApi.images(workId, entityId),
  });
  const images = data ?? [];
  const primaryImage = images.find((image) => image.isPrimary) ?? null;
  return { images, primaryImage, isPending };
}
