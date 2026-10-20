import { useCallback, useState } from 'react';
import { Button } from 'react-bootstrap';
import { VetModal } from './ui';

/**
 * `const [confirm, confirmDialog] = useConfirm();` then `if (await confirm({ title, body })) …` and
 * render `{confirmDialog}` once. Replaces window.confirm, which ignores the page's look and theme.
 */
export default function useConfirm() {
  const [ask, setAsk] = useState(null);

  const confirm = useCallback(
    ({ title, body, confirmLabel = 'Xác nhận', danger = false }) =>
      new Promise((resolve) => setAsk({ title, body, confirmLabel, danger, resolve })),
    []
  );

  const close = (answer) => {
    ask?.resolve(answer);
    setAsk(null);
  };

  const dialog = (
    <VetModal
      show={Boolean(ask)}
      onHide={() => close(false)}
      title={ask?.title}
      icon={ask?.danger ? 'bi-exclamation-triangle' : 'bi-question-circle'}
      footer={
        <>
          <Button variant="vet-outline" onClick={() => close(false)}>
            Hủy
          </Button>
          <Button variant={ask?.danger ? 'vet-danger' : 'vet'} onClick={() => close(true)} autoFocus>
            {ask?.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="vet-muted">{ask?.body}</div>
    </VetModal>
  );

  return [confirm, dialog];
}
