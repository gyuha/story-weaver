import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

/**
 * 늘려쓰기(요약 → 본문) 진행 다이얼로그.
 *
 * 요약 모달이 닫힌 뒤 진행 상태를 담당한다 — `open`을 `draftingBody`에 그대로 묶어
 * 생성이 끝나거나 중단되면 스스로 닫힌다(닫는 시점을 따로 관리하지 않는다).
 *
 * `중단`을 두는 이유: 이 생성은 **기존 본문을 대체**하고 되돌릴 수단이 에디터의
 * 되돌리기뿐이라, 잘못 시작했을 때 멈출 길이 없으면 안 된다.
 */
export function DraftProgressModal({ open, onCancel }: { open: boolean; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ai">
            <Loader2 className="size-4 animate-spin" />
            AI로 작성 중
          </DialogTitle>
          <p className="text-[12.5px] text-ink-soft">
            요약을 근거로 이 화의 본문을 쓰고 있습니다. 완료되면 본문에 반영됩니다.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-md border border-line-strong p-3">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-[85%] rounded" />
          <Skeleton className="h-4 w-[60%] rounded" />
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-[5px] border border-line-strong bg-paper px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
          >
            중단
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
