import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

/** 요약 모달의 단계. `요약` 칩을 누르면 언제나 `idle`로 열린다. */
export type SummaryPhase = 'idle' | 'generating' | 'done';

interface SummaryModalProps {
  open: boolean;
  /** 저장돼 있는 요약. 없거나 공백뿐이면 "없음"으로 본다. */
  existingSummary?: string;
  /** 이번에 생성한 요약(아직 저장되지 않음). */
  generatedText: string;
  phase: SummaryPhase;
  error: Error | null;
  onGenerate: () => void;
  onApply: (text: string) => void;
  onClose: () => void;
}

/**
 * 화 요약 보기·생성 모달. 후보 피커(`ContinueSuggestionModal`)와 모양이 다르다 —
 * 후보 여러 장을 고르는 게 아니라 요약 한 덩어리를 보여주고, 그 앞에 "저장된 요약을
 * 먼저 보여준다"는 단계가 있다.
 *
 * 단계별 버튼:
 * - `idle` + 저장된 요약 있음 → 그 요약 + `다시 요약` / `닫기`
 * - `idle` + 저장된 요약 없음 → **빈 상자** + `요약` / `닫기` (비었다는 게 눈에 보이게)
 * - `generating` → 스켈레톤 + `닫기`
 * - `done` → 새 요약 + `적용` / `닫기`
 *
 * **`done`에서 `닫기`는 저장하지 않는다** — 요약은 덮어쓰기라 확인 없이 기존 요약을
 * 날리면 되돌릴 수 없다. `적용`을 눌러야 저장된다.
 */
export function SummaryModal({
  open,
  existingSummary,
  generatedText,
  phase,
  error,
  onGenerate,
  onApply,
  onClose,
}: SummaryModalProps) {
  const saved = existingSummary?.trim() ? existingSummary : '';
  // 생성 중·완료 단계에서는 기존 요약을 감춘다 — 새 결과가 올 자리이고, 둘을 같이
  // 보여주면 어느 쪽이 저장된 것인지 헷갈린다.
  const shown = phase === 'idle' ? saved : phase === 'done' ? generatedText : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-ai">AI 요약</DialogTitle>
          {phase === 'done' && (
            <p className="text-[12.5px] text-ink-soft">
              적용하면 기존 요약을 덮어씁니다. 닫으면 저장하지 않습니다.
            </p>
          )}
        </DialogHeader>

        {error && <p className="text-[13px] text-danger">{error.message}</p>}

        <div
          data-testid="summary-body"
          className="min-h-[96px] rounded-md border border-line-strong p-3 text-[13.5px] leading-[1.75] text-ink"
        >
          {phase === 'generating' ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-[85%] rounded" />
            </div>
          ) : (
            shown
          )}
        </div>

        <DialogFooter>
          {phase === 'done' && (
            <button
              type="button"
              onClick={() => onApply(generatedText)}
              className="h-8 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              적용
            </button>
          )}
          {phase === 'idle' && (
            <button
              type="button"
              onClick={onGenerate}
              className="h-8 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {saved ? '다시 요약' : '요약'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[5px] border border-line-strong bg-paper px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
