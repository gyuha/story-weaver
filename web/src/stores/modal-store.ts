import React from 'react';
import type { JSX } from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface IModalState {
  modals: ModalProps[];
  focusLockDisabled: boolean;
}

export interface IModalStore extends IModalState {
  modalCount: () => number;
  openModal: (
    modalProp: ModalProps | string | JSX.Element,
    hideBottomButton?: boolean,
    options?: { portal?: boolean; portalTarget?: React.RefObject<HTMLElement | null> }
  ) => void;
  closeModal: () => void;
  closeAllModal: () => void;
  setFocusLockDisabled: (lock: boolean) => void;
  reset: () => void;
}

const initialState: IModalState = {
  modals: [],
  focusLockDisabled: false,
};

const useModal = create<IModalStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      modalCount: () => get().modals.length,
      openModal: (
        props: ModalProps | string | JSX.Element,
        hideBottomButton = false,
        options?: { portal?: boolean; portalTarget?: React.RefObject<HTMLElement | null> }
      ) => {
        if (typeof props === 'string' || React.isValidElement(props)) {
          get().openModal({
            alert: props,
            size: 'sm',
            height: 'auto',
            hideBottomButton,
            ...(options?.portal && options?.portalTarget
              ? { portal: true, portalTarget: options.portalTarget }
              : {}),
          });
          return;
        }

        const portalOptions =
          options?.portal && options?.portalTarget
            ? { portal: true, portalTarget: options.portalTarget }
            : {};

        const modalProps: ModalProps = {
          ...(props as ModalProps),
          ...portalOptions,
        };

        set((state) => ({ modals: [...state.modals, modalProps] }));
      },
      closeModal: () => {
        set((state) => ({ modals: state.modals.slice(0, state.modals.length - 1) }));
      },
      closeAllModal: () => {
        set(initialState);
      },
      setFocusLockDisabled: (lock: boolean) => {
        set({ focusLockDisabled: lock });
      },
      reset: () => {
        set(initialState);
      },
    }),
    {
      enabled: true,
    }
  )
);

export default useModal;
