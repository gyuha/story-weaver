// 카드 상세의 설정 이미지 영역 — 대표 이미지를 크게 + 이력 썸네일 스트립(fg-visual로 확정된
// "A · 대표 크게 + 썸네일 스트립" 레이아웃, .forge/visual/48950-1786458338/content/gallery-layout.html)
// 아래에 적용될 작품 화풍 한 줄 + 추가 지시 + 생성 버튼을 둔다. 템플릿 선택 그리드는 없다 —
// (작품 화풍 + 카드 유형)이 템플릿을 하나로 결정하므로 선택지가 없다(ADR 260813-110724).
import type { Entity } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { imageGenerationApi } from '../api/entity-images.api';
import { entityImagesQueryKey, useEntityImages } from '../lib/use-entity-images';
import {
  type EntityImageGenerationStage,
  useGenerateEntityImage,
} from '../lib/use-generate-entity-image';
import { AuthedImage } from './authed-image';

const STAGE_LABEL: Record<EntityImageGenerationStage, string> = {
  prompt: '프롬프트 조립 중',
  image: '이미지 생성 중',
  description: '시각 묘사 작성 중',
};

export function EntityImageSection({ workId, entity }: { workId: string; entity: Entity }) {
  const entityId = entity.id;
  const queryClient = useQueryClient();

  const { images, primaryImage } = useEntityImages(workId, entityId);
  const invalidateImages = () =>
    queryClient.invalidateQueries({ queryKey: entityImagesQueryKey(workId, entityId) });

  const { data: workArtStyle } = useQuery({
    queryKey: ['work-art-style', workId],
    queryFn: () => imageGenerationApi.workArtStyle(workId),
  });
  const { data: artStyleCatalog = [] } = useQuery({
    queryKey: ['art-styles'],
    queryFn: () => imageGenerationApi.artStyles(),
  });
  const artStyleId = workArtStyle?.artStyleId ?? null;
  const artStyleLabel = artStyleCatalog.find((style) => style.id === artStyleId)?.label ?? null;

  const [extraPrompt, setExtraPrompt] = useState('');

  const { start, cancel, stage, isGenerating, error } = useGenerateEntityImage({
    onImage: invalidateImages,
    onDescription: invalidateImages,
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (imageId: string) =>
      imageGenerationApi.updateImage(workId, imageId, { isPrimary: true }),
    onSuccess: invalidateImages,
  });

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const updateDescriptionMutation = useMutation({
    mutationFn: (visualDescription: string) => {
      if (!primaryImage) throw new Error('대표 이미지가 없습니다');
      return imageGenerationApi.updateImage(workId, primaryImage.id, { visualDescription });
    },
    onSuccess: () => {
      invalidateImages();
      setEditingDescription(false);
    },
  });

  const handleGenerate = () => {
    start({ workId, entityId, extraPrompt: extraPrompt.trim() });
  };

  const openDescriptionEditor = () => {
    setDescriptionDraft(primaryImage?.visualDescription ?? '');
    setEditingDescription(true);
  };

  // 429(생성 한도)와 409(화풍 미지정)는 시스템 오류가 아니라 안내다 — 나머지는 alert.
  const isNotice = (error?.includes('한도') || error?.includes('화풍')) ?? false;

  return (
    <div className="mt-[26px] border-t border-ink/[0.07] pt-[22px]">
      <div className="mb-[13px] flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">설정 이미지</span>
        <span className="text-[12px] text-faint">{images.length}장</span>
      </div>

      <div className="relative mb-[9px]">
        {primaryImage ? (
          <AuthedImage
            path={primaryImage.imageUrl}
            alt={entity.name}
            className="h-[220px] w-full rounded-lg border border-line object-cover"
            fallback={
              <div className="h-[220px] w-full rounded-lg border border-line bg-[#f1f1ef]" />
            }
          />
        ) : (
          <div className="grid h-[220px] w-full place-items-center rounded-lg border border-line bg-[#f1f1ef] text-[48px]">
            {entity.emoji}
          </div>
        )}
        {primaryImage && (
          <span className="absolute top-2 left-2 rounded bg-ink/85 px-2 py-0.5 text-[10px] font-semibold text-white">
            대표
          </span>
        )}
      </div>

      {(images.length > 0 || isGenerating) && (
        <div className="mb-[18px] flex gap-[7px]">
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              aria-pressed={image.isPrimary}
              aria-label={image.isPrimary ? '대표 이미지' : '대표로 지정'}
              onClick={() => setPrimaryMutation.mutate(image.id)}
              className={cn(
                'size-14 shrink-0 overflow-hidden rounded-md border p-0',
                image.isPrimary ? 'border-2 border-ink' : 'border-line'
              )}
            >
              <AuthedImage path={image.imageUrl} alt="" className="size-full object-cover" />
            </button>
          ))}
          {isGenerating && (
            <div
              data-testid="image-generating-tile"
              className="grid size-14 shrink-0 place-items-center rounded-md border border-dashed border-line-strong text-center text-[9.5px] text-faint"
            >
              생성 중
            </div>
          )}
        </div>
      )}

      {primaryImage && (
        <div className="mb-[18px] border-t border-ink/[0.07] pt-[10px]">
          <div className="mb-[5px] text-[11px] font-semibold text-faint">시각 묘사</div>
          {editingDescription ? (
            <div className="flex flex-col gap-2">
              <textarea
                aria-label="시각 묘사 편집"
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                className="min-h-16 rounded-md border border-line p-2 text-[12.5px]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateDescriptionMutation.mutate(descriptionDraft)}
                  className="h-8 rounded-md border border-ai/30 bg-ai/10 px-3 text-[12.5px] font-medium text-ai"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDescription(false)}
                  className="h-8 rounded-md border border-line-strong px-3 text-[12.5px] font-medium text-ink-soft"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              {primaryImage.visualDescription ? (
                <p className="text-[12.5px] leading-[1.55] text-ink-soft">
                  {primaryImage.visualDescription}
                </p>
              ) : (
                <p className="text-[12.5px] text-faint italic">이 이미지에는 묘사가 없습니다.</p>
              )}
              <button
                type="button"
                onClick={openDescriptionEditor}
                className="shrink-0 text-[12px] font-medium text-muted-ink hover:underline"
              >
                수정
              </button>
            </div>
          )}
        </div>
      )}

      {artStyleId ? (
        <>
          <div className="mb-[7px] flex items-center gap-1.5 text-[12px] text-ink-soft">
            <span>이 작품의 화풍: {artStyleLabel}</span>
            <Link
              to="/works/$workId/art-style"
              params={{ workId }}
              className="font-medium text-muted-ink hover:underline"
            >
              바꾸기
            </Link>
          </div>

          <textarea
            aria-label="추가 지시"
            value={extraPrompt}
            onChange={(e) => setExtraPrompt(e.target.value)}
            placeholder="추가 지시 (비우면 카드 필드로 자동 구성)"
            className="w-full rounded-md border border-line p-2 text-[12.5px]"
          />

          <div className="mt-2 flex items-center gap-2">
            {isGenerating ? (
              <>
                <span className="text-[12px] text-muted-ink">
                  {STAGE_LABEL[stage ?? 'prompt']}…
                </span>
                <button
                  type="button"
                  onClick={cancel}
                  className="h-8 rounded-md border border-line-strong px-3 text-[12.5px] font-medium text-ink-soft"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                className="h-8 rounded-md border border-ai/30 bg-ai/10 px-3 text-[12.5px] font-medium text-ai"
              >
                생성
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-[12px] text-muted-ink">
          먼저 이 작품의 화풍을 정해 주세요 →{' '}
          <Link to="/works/$workId/art-style" params={{ workId }} className="font-medium underline">
            이미지 스타일
          </Link>
        </p>
      )}

      {error && (
        <p
          role={isNotice ? 'status' : 'alert'}
          className={cn('mt-2 text-[12px]', isNotice ? 'text-muted-ink' : 'text-[#c4554d]')}
        >
          {error}
        </p>
      )}
    </div>
  );
}
