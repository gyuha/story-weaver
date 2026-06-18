import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal/modal';
import StringToHtml from '@/components/ui/string-to-html';
import { useMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import useModal from '@/stores/modal-store';
import type React from 'react';

const InfoContainer = ({ children }: { children: React.ReactNode }) => (
  <pre
    className={cn(
      'my-6 justify-center gap-2.5 rounded-sm bg-muted px-4 py-3 text-muted-foreground'
    )}
  >
    {children}
  </pre>
);
const ContentContainer = ({ children }: { children: React.ReactNode }) => (
  <div className={cn('justify-center gap-2.5 text-base')}>{children}</div>
);
const AlertContainer = ({ children }: { children: React.ReactNode }) => (
  <div className={cn('my-6 w-full justify-center gap-2.5 px-4 py-3 text-center text-base')}>
    {children}
  </div>
);

type DefaultModalProps = {
  className?: string;
  size?: ModalSize;
  zIndex?: number;
} & (ModalAlertProps | ContentModalProps);

const ModalDefault = ({
  className,
  size = 'md',
  ...rest
}: DefaultModalProps): React.JSX.Element | null => {
  const { closeModal } = useModal();
  const isMobile = useMobile();

  const title = 'title' in rest ? rest.title : undefined;
  const hideCloseButton = 'hideCloseButton' in rest ? rest.hideCloseButton : false;
  const handleClose = 'handleClose' in rest ? rest.handleClose : undefined;
  const handleOk = 'handleOk' in rest ? rest.handleOk : undefined;
  const hideBottomButton = 'hideBottomButton' in rest ? rest.hideBottomButton : undefined;
  const handleCancel = 'handleCancel' in rest ? rest.handleCancel : undefined;
  const hideBottomCancelButton =
    'hideBottomCancelButton' in rest ? rest.hideBottomCancelButton : undefined;
  const txtCancel = 'txtCancel' in rest ? rest.txtCancel : undefined;

  return (
    <Modal.Container size={size} className={isMobile ? 'justify-center gap-4' : ''}>
      <Modal.Header hideCloseButton={hideCloseButton} handleClose={handleClose}>
        {title}
      </Modal.Header>
      <Modal.Content className={className}>
        <>
          {'info' in rest && <InfoContainer>{rest.info}</InfoContainer>}
          {'alert' in rest && (
            <AlertContainer>
              <StringToHtml text={rest.alert} />
            </AlertContainer>
          )}
          {'content' in rest && (
            <ContentContainer>
              <StringToHtml text={rest.content} />
            </ContentContainer>
          )}
        </>
      </Modal.Content>
      {!hideBottomButton && (
        <Modal.Footer>
          {handleCancel !== undefined ? (
            !hideBottomCancelButton ? (
              <Button
                variant={'secondary'}
                size={'lg'}
                className="min-w-0 border-[1.5px] border-foreground"
                onClick={() => {
                  handleCancel();
                }}
              >
                취소
              </Button>
            ) : null
          ) : null}
          {txtCancel && !handleCancel && (
            <Button
              variant={'secondary'}
              size={'lg'}
              className="min-w-0 border-[1.5px] border-neutral-900"
              onClick={closeModal}
            >
              {txtCancel}
            </Button>
          )}
          <Button
            variant={'default'}
            size={'lg'}
            onClick={handleOk ? handleOk : closeModal}
            className={hideBottomCancelButton ? 'w-40' : 'min-w-0'}
          >
            확인
          </Button>
        </Modal.Footer>
      )}
    </Modal.Container>
  );
};

export default ModalDefault;
