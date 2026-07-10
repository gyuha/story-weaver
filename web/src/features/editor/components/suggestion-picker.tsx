import { parseSuggestions } from '@/features/editor/lib/parse-suggestions';

interface SuggestionPickerProps {
  rawText: string;
  isStreaming: boolean;
  error: Error | null;
  onApply: (text: string) => void;
  onCancel: () => void;
}

/** AI 이어쓰기 다중 후보 선택 패널. 스트리밍 중엔 원문 blob, 완료되면 후보 카드로 분리. */
export function SuggestionPicker({
  rawText,
  isStreaming,
  error,
  onApply,
  onCancel,
}: SuggestionPickerProps) {
  return (
    <div className="rounded-lg border border-line bg-paper p-3 shadow-sm">
      <div className="mb-1.5 text-[11.5px] font-semibold text-ai">
        AI 이어쓰기{isStreaming ? ' · 생성 중…' : ''}
      </div>

      {error ? (
        <div className="mb-2.5 text-[13px] text-danger">{error.message}</div>
      ) : isStreaming ? (
        <div className="mb-2.5 max-h-40 overflow-y-auto text-[13px] leading-[1.6] text-ink">
          {rawText}
        </div>
      ) : (
        <div className="mb-2.5 flex max-h-60 flex-col gap-2 overflow-y-auto">
          {parseSuggestions(rawText).map((suggestion) => (
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
