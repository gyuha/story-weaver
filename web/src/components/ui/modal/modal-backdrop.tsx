import { cn } from '@/lib/utils';
import useModal from '@/stores/modal-store';
import { motion } from 'motion/react';
import type React from 'react';
import { useEffect } from 'react';

interface IModalBackdropProps {
  className?: string;
  children?: React.ReactNode;
  zIndex: number;
}

const ModalBackdrop = ({
  className,
  children,
  zIndex,
}: IModalBackdropProps): React.JSX.Element | null => {
  const { modals, modalCount } = useModal();

  // biome-ignore lint/correctness/useExhaustiveDependencies: modalCount drives body overflow
  useEffect(() => {
    if (modalCount()) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [modals]);

  if (!modalCount()) {
    return null;
  }

  return (
    <motion.div
      className={cn(
        'fixed inset-0 flex items-center justify-center',
        // frosted glass: heavy blur + slight color saturation; full-opacity fallback when backdrop-filter unsupported
        'bg-black/50 supports-[backdrop-filter]:bg-black/30',
        'backdrop-blur-md backdrop-saturate-150',
        className
      )}
      style={{ zIndex }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
};

export default ModalBackdrop;
