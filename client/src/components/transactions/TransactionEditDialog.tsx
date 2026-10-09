import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useConfirmTransaction, useDeleteTransaction, useMerchant, useUpdateTransaction } from '@/api/hooks';
import { AllocationForm } from '@/components/envelopes/AllocationForm';
import { Button, ConfirmDialog, Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import { MerchantHeading } from './MerchantHeading';
import { QuickEntry } from './QuickEntry';

type TransactionEditDialogProps = { transaction: Transaction | null; onClose: () => void };

/** Édition, confirmation et suppression d'une opération existante. */
export function TransactionEditDialog({ transaction, onClose }: TransactionEditDialogProps) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateTransaction({
    onSuccess: () => {
      toast.success('Opération modifiée');
      onClose();
    },
  });
  const confirm = useConfirmTransaction({
    onSuccess: () => {
      toast.success('Opération confirmée');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useDeleteTransaction({
    onSuccess: () => {
      toast.success('Opération supprimée');
      setConfirmDelete(false);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Une erreur d'enregistrement ne doit pas réapparaître à l'ouverture d'une autre opération.
  const close = () => {
    update.reset();
    onClose();
  };

  const t = transaction;
  // Le nom suit le marchand en cache : il change dès qu'on le renomme, sans rouvrir le dialogue.
  const merchant = useMerchant(t?.merchantKey ?? null);
  const title = !t ? '' : t.merchantKey ? (merchant.data?.name ?? displayLabel(t)) : `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}`;
  const serverError = update.error ? errorMessage(update.error) : null;
  const deleteButton = (
    <Button variant="danger-quiet" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
      Supprimer
    </Button>
  );

  return (
    <>
      <Dialog
        open={t !== null && !confirmDelete}
        onClose={close}
        title={title}
        description={t?.status === 'planned' ? 'Opération prévue par une règle récurrente, pas encore passée en banque.' : undefined}
        size={t?.kind === 'allocation' ? 'md' : 'lg'}
      >
        {t ? (
          t.kind === 'allocation' ? (
            <AllocationForm
              key={t.id}
              initial={t}
              submitLabel="Enregistrer"
              submitting={update.isPending}
              serverError={serverError}
              onSubmit={(input) => update.mutate({ id: t.id, ...input })}
              onCancel={close}
              footerStart={deleteButton}
            />
          ) : (
            <>
              {t.merchantKey ? <MerchantHeading key={t.id} merchantKey={t.merchantKey} /> : null}
              <QuickEntry
                key={t.id}
                mode="edit"
                initial={t}
                submitting={update.isPending}
                serverError={serverError}
                onSubmit={(input) => update.mutate({ id: t.id, ...input })}
                footerStart={deleteButton}
                footerExtra={
                  t.status === 'planned' ? (
                    <Button variant="ghost" icon={<Check />} loading={confirm.isPending} onClick={() => confirm.mutate(t.id)}>
                      Confirmer sans modifier
                    </Button>
                  ) : null
                }
              />
            </>
          )
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={t !== null && confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => t && remove.mutate(t.id)}
        title="Supprimer cette opération ?"
        description="Les soldes du compte et de l'enveloppe sont recalculés. Cette action est définitive."
        confirmLabel="Supprimer"
        loading={remove.isPending}
      >
        {t ? displayLabel(t) : null}
      </ConfirmDialog>
    </>
  );
}
