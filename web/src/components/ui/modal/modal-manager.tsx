import Modal, { MODAL_Z_INDEX } from '@/components/ui/modal/modal';
import ModalBackdrop from '@/components/ui/modal/modal-backdrop';
import useModal from '@/stores/modal-store';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modals = () => {
  const { modals, closeModal, focusLockDisabled, modalCount } = useModal();

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (focusLockDisabled || modalCount() === 0) {
        return;
      }
      if (e.key === 'Escape') {
        if (modals.length > 0 && modals[modals.length - 1].disabledEscKey !== true) {
          closeModal();
        }
      }
    },
    [modals, closeModal, focusLockDisabled, modalCount]
  );

  useEffect(() => {
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyUp]);

  const regularModals = modals.filter((modal) => !modal.portal);

  return (
    <>
      <AnimatePresence initial={false}>
        {regularModals.length > 0 && <ModalBackdrop zIndex={MODAL_Z_INDEX} />}
        {regularModals.map((modalProps, idx) => {
          const modalKey = modalProps.id || `modal-${idx}`;
          const zIndex = modalProps.zIndex || MODAL_Z_INDEX + idx;
          return (
            <Modal.Ground key={modalKey}>
              <Modal {...modalProps} zIndex={zIndex} />
            </Modal.Ground>
          );
        })}
      </AnimatePresence>

      {modals
        .filter((modal) => modal.portal && modal.portalTarget?.current)
        .map((modalProps, idx) => {
          const modalKey = modalProps.id || `portal-modal-${idx}`;
          const zIndex = modalProps.zIndex || MODAL_Z_INDEX + modals.length + idx;

          return modalProps.portalTarget?.current
            ? createPortal(
                <AnimatePresence initial={false}>
                  <ModalBackdrop zIndex={zIndex}>
                    <Modal.Ground key={modalKey}>
                      <Modal {...modalProps} zIndex={zIndex} />
                    </Modal.Ground>
                  </ModalBackdrop>
                </AnimatePresence>,
                modalProps.portalTarget.current
              )
            : null;
        })}
    </>
  );
};

export default Modals;
