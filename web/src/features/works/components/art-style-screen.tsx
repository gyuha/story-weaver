// 이미지 스타일 화면 — 작품 화풍(art style) 선택 + 작품 고유 톤 + 저장.
// 결정의 본질이 "내 작품 전체가 이 화풍으로 보인다"를 판단하는 것이라, 화풍마다
// 유형 견본 3장(인물·장소·아이템)을 한 줄에 보여준다(그릴링에서 fg-visual로 확정한 C안).
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiErrorMessage } from '@/features/auth/lib/api-error';
import type { Work } from '@/features/shared/types';
import { apiImageSrc } from '@/features/world-bible/api/entity-images.api';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { artStylesMutations, artStylesQueries, hasAnyEntityImages } from '../api/art-styles.api';

const SAMPLE_TYPES: { key: string; label: string }[] = [
  { key: 'character', label: '인물' },
  { key: 'location', label: '장소' },
  { key: 'item', label: '아이템' },
];

export function ArtStyleScreen({ work }: { work: Work }) {
  const queryClient = useQueryClient();
  const workArtStyleQuery = useQuery(artStylesQueries.work({ path: { work_id: work.id } }));
  const artStylesListQuery = useQuery(artStylesQueries.list());
  const artStyles = artStylesListQuery.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toneDraft, setToneDraft] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (workArtStyleQuery.data) {
      setSelectedId(workArtStyleQuery.data.artStyleId);
      setToneDraft(workArtStyleQuery.data.artStyleNote ?? '');
    }
  }, [workArtStyleQuery.data]);

  const updateMutation = useMutation(artStylesMutations.update());

  const doSave = (artStyleId: string) => {
    updateMutation.mutate(
      { path: { work_id: work.id }, body: { artStyleId, artStyleNote: toneDraft } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: artStylesQueries.work({ path: { work_id: work.id } }).queryKey,
          });
        },
        onError: (err) => toast.error(apiErrorMessage(err, '화풍을 저장하지 못했습니다')),
      }
    );
  };

  const handleSave = async () => {
    if (!selectedId) return;
    const originalArtStyleId = workArtStyleQuery.data?.artStyleId ?? null;
    if (selectedId === originalArtStyleId) {
      doSave(selectedId);
      return;
    }
    const hasImages = await hasAnyEntityImages(
      work.id,
      work.entities.map((e) => e.id)
    );
    if (hasImages) {
      setConfirmOpen(true);
    } else {
      doSave(selectedId);
    }
  };

  return (
    <div className="mx-auto max-w-[820px] px-10 py-12">
      <h1 className="mb-1 text-[22px] font-bold text-ink">이미지 스타일</h1>
      <p className="mb-8 text-[13px] text-ink-soft">
        이 작품에서 설정 이미지를 생성할 때 쓰일 화풍을 견본으로 골라 주세요.
      </p>

      <div className="flex flex-col gap-3">
        {artStyles.map((style) => {
          const selected = style.id === selectedId;
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={selected}
              aria-label={style.label}
              onClick={() => setSelectedId(style.id)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                selected ? 'border-2 border-ink' : 'border-line'
              )}
            >
              <div className="mb-2 text-[14px] font-semibold text-ink">{style.label}</div>
              <div className="flex gap-2">
                {SAMPLE_TYPES.map(({ key, label }) => (
                  <SampleThumbnail
                    key={key}
                    src={style.samples[key]}
                    alt={`${style.label} ${label} 견본`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <label
          htmlFor="art-style-tone"
          className="mb-1.5 block text-[12px] font-semibold text-muted-ink"
        >
          작품 고유의 톤
        </label>
        <input
          id="art-style-tone"
          value={toneDraft}
          onChange={(e) => setToneDraft(e.target.value)}
          placeholder="예: 어둡고 습한 분위기 (비워도 됩니다)"
          className="w-full rounded-md border border-line p-2 text-[13px]"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!selectedId}
        className="mt-4 h-9 rounded-md bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-40"
      >
        저장
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="화풍을 바꿀까요?"
        message="이미 만든 이미지는 그대로 남고, 앞으로 생성하는 이미지만 새 화풍을 따릅니다."
        onConfirm={() => {
          setConfirmOpen(false);
          if (selectedId) doSave(selectedId);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function SampleThumbnail({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div className="grid h-16 w-20 place-items-center rounded-md bg-[#f1f1ef] text-lg">🖼️</div>
    );
  }

  return (
    <img
      src={apiImageSrc(src)}
      alt={alt}
      onError={() => setBroken(true)}
      className="h-16 w-20 rounded-md object-cover"
    />
  );
}
