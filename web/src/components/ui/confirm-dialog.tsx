import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * 확인/취소 다이얼로그 — Base UI `Dialog` 기반.
 *
 * `useModal`(`openModal({ alert, handleOk })`)로도 같은 것을 띄울 수 있지만, 그 시스템의
 * `Modal.Ground`는 `fixed inset-0 z-50`이라 **stacking context를 만든다**. 그래서 그 안의
 * 모달에 z-index를 얼마로 주든 바깥의 Base UI `Dialog`(z-50, body 끝 포털)를 넘지 못하고
 * 아래로 깔린다. Base UI 모달 위에 확인창을 띄워야 할 때는 같은 시스템을 써야 한다.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-[13px] leading-[1.7] text-ink-soft">{message}</p>
        </DialogHeader>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-[5px] border border-line-strong bg-paper px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 rounded-[5px] bg-primary px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
