import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';

/** 요약 모달의 단계. `요약` 칩을 누르면 언제나 `idle`로 열린다. */
export type SummaryPhase = 'idle' | 'generating';

interface SummaryModalProps {
  open: boolean;
  /** 저장돼 있는 요약. 없거나 공백뿐이면 "없음"으로 본다. */
  existingSummary?: string;
  phase: SummaryPhase;
  error: Error | null;
  /** 본문 → 요약 생성. 결과는 호출부가 `existingSummary`로 흘려 편집란에 들어온다. */
  onGenerate: () => void;
  /** 편집란 요약으로 화 본문을 생성한다(늘려쓰기). */
  onDraft: (summary: string) => void;
  onSave: (summary: string) => void;
  onClose: () => void;
}

/**
 * 화 요약 편집 모달 — **편집란 하나 + 직업 4개** 구조(task #70).
 *
 * 요약은 AI 전용 산출물이 아니라 작가가 소유하는 텍스트다. 그래서 저장된 요약이
 * 편집란에 들어 있고 직접 고쳐 저장할 수 있다. `AI 요약` 결과도 편집란에 들어와
 * 손본 뒤 저장하므로, 이전의 `done`(적용 대기) 단계가 필요 없어졌다 — `저장` 버튼이
 * 그 확인 역할을 한다.
 *
 * **`닫기`는 저장하지 않는다** — 요약은 덮어쓰기라 확인 없이 저장하지 않는다.
 */
export function SummaryModal({
  open,
  existingSummary,
  phase,
  error,
  onGenerate,
  onDraft,
  onSave,
  onClose,
}: SummaryModalProps) {
  const saved = existingSummary?.trim() ? existingSummary : '';
  const [value, setValue] = useState(saved);

  // 저장된 요약이 바뀌면 편집란을 새 값으로 맞춘다 — 다른 화로 옮겼거나, AI 요약
  // 결과가 흘러들어온 경우다. 편집 중 내용이 이걸로 덮이지만 textarea의 기본
  // 되돌리기(⌘Z)가 있어 위험도가 낮다.
  useEffect(() => {
    setValue(saved);
  }, [saved]);

  const busy = phase === 'generating';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-ai">요약</DialogTitle>
          <p className="text-[12.5px] text-ink-soft">
            이 화의 줄거리를 적어 두면 나중에 흐름을 되짚을 때 씁니다. 직접 고쳐도 됩니다.
          </p>
        </DialogHeader>

        {error && <p className="text-[13px] text-danger">{error.message}</p>}

        {busy ? (
          // 편집란과 같은 높이 규칙을 써서 생성 중에 모달 크기가 튀지 않게 한다.
          <div className="flex min-h-[min(270px,40vh)] flex-col gap-2 rounded-md border border-line-strong p-3">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-[85%] rounded" />
            <Skeleton className="h-4 w-[60%] rounded" />
          </div>
        ) : null}

        <Textarea
          aria-label="화 요약"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          rows={5}
          placeholder="이 화에서 무슨 일이 일어났는지 적어 보세요."
          // 요약을 여러 문단 손보는 곳이라 처음부터 넉넉히 연다(요청 높이 270px).
          // `DialogContent`에 max-h가 없어, 짧은 창에서 하단 버튼이 화면 밖으로 나가지
          // 않도록 하한을 40vh로 함께 묶고 상한을 55vh로 잡는다(넘치면 상자 안에서 스크롤).
          className={
            busy ? 'sr-only' : 'min-h-[min(270px,40vh)] max-h-[55vh] text-[13.5px] leading-[1.75]'
          }
        />

        <DialogFooter>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="h-8 rounded-[5px] border border-line-strong bg-paper px-3 text-[12.5px] font-medium text-ai transition-colors hover:bg-surface disabled:opacity-40"
          >
            AI로 본문 요약
          </button>
          <button
            type="button"
            onClick={() => onDraft(value)}
            disabled={busy}
            className="h-8 rounded-[5px] border border-line-strong bg-paper px-3 text-[12.5px] font-medium text-ai transition-colors hover:bg-surface disabled:opacity-40"
          >
            요약으로 본문 작성
          </button>
          <button
            type="button"
            onClick={() => onSave(value)}
            disabled={busy}
            className="h-8 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            요약 저장
          </button>
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
