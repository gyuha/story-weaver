import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { parsePartialSuggestions } from '@/features/editor/lib/parse-suggestions';

interface SuggestionPickerProps {
  /** 헤더에 그릴 액션 이름 — 호출부가 반드시 정한다(누른 액션을 가리켜야 하므로 기본값 없음). */
  title: string;
  rawText: string;
  isStreaming: boolean;
  error: Error | null;
  onApply: (text: string) => void;
  onCancel: () => void;
}

/** AI 제안 후보 선택 팝오버. 선택 영역 액션(다시쓰기·늘리기·줄이기·톤 변경)이 쓴다. */
export function SuggestionPicker({
  title,
  rawText,
  isStreaming,
  error,
  onApply,
  onCancel,
}: SuggestionPickerProps) {
  const { completed, growing } = parsePartialSuggestions(rawText, !isStreaming);

  return (
    <div className="rounded-lg border border-line bg-paper p-3 shadow-sm">
      <div className="mb-1.5 text-[11.5px] font-semibold text-ai">
        {title}
        {isStreaming ? ' · 생성 중…' : ''}
      </div>

      {error ? (
        <div className="mb-2.5 text-[13px] text-danger">{error.message}</div>
      ) : (
        <div className="mb-2.5 flex max-h-60 flex-col gap-2 overflow-y-auto">
          {completed.map((suggestion) => (
            <div key={suggestion} className="rounded-md border border-line-strong p-2">
              <div className="mb-1.5 text-[13px] leading-[1.6] text-ink">{suggestion}</div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onApply(suggestion)}
                  className="h-7 rounded-[5px] bg-primary px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  적용
                </button>
              </div>
            </div>
          ))}
          {growing && <Skeleton className="h-16 w-full rounded-md" />}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-[5px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
        >
          취소
        </button>
      </div>
    </div>
  );
}

interface ContinueSuggestionModalProps {
  open: boolean;
  rawText: string;
  isStreaming: boolean;
  error: Error | null;
  onApply: (text: string) => void;
  onCancel: () => void;
}

/**
 * AI 이어쓰기 후보 선택 모달(manuscript.tsx의 "AI 이어쓰기" 전용). 열려 있는 동안
 * 편집 화면은 딤 처리·상호작용 차단(Base UI Dialog의 modal 기본값)되고, 완성된 후보만
 * 카드로 렌더한다 — 원문 스트림 텍스트는 화면에 직접 노출하지 않는다. 자라는 중인 후보는
 * 스켈레톤 1개로 나타낸다. 총 후보 개수는 백엔드가 3~5개 중 생성해 미리 알 수 없으므로
 * 헤더에 총계를 표기하지 않는다.
 */
export function ContinueSuggestionModal({
  open,
  rawText,
  isStreaming,
  error,
  onApply,
  onCancel,
}: ContinueSuggestionModalProps) {
  const { completed, growing } = parsePartialSuggestions(rawText, !isStreaming);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-ai">AI 이어쓰기</DialogTitle>
          {!error && (
            <p className="text-[12.5px] text-ink-soft">
              {completed.length}개 생성됨{isStreaming ? ' · 계속 생성 중…' : ''}
            </p>
          )}
        </DialogHeader>

        {error ? (
          <p className="text-[13px] text-danger">{error.message}</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {completed.map((suggestion) => (
              <div key={suggestion} className="rounded-md border border-line-strong p-2">
                <div className="mb-1.5 text-[13px] leading-[1.6] text-ink">{suggestion}</div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApply(suggestion)}
                    className="h-7 rounded-[5px] bg-primary px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    적용
                  </button>
                </div>
              </div>
            ))}
            {growing && <Skeleton className="h-16 w-full rounded-md" />}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-[5px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
          >
            취소
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
