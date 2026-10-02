import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useConfirmTransaction, useDeleteTransaction, useUpdateTransaction } from '@/api/hooks';
import { Button, Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { TransactionForm } from './TransactionForm';
import styles from './TransactionEditDialog.module.css';

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

  const t = transaction;
  return (
    <>
      <Dialog
        open={t !== null && !confirmDelete}
        onClose={onClose}
        title={t ? `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}` : ''}
        description={t?.status === 'planned' ? 'Opération prévue par une règle récurrente, pas encore passée en banque.' : undefined}
      >
        {t ? (
          <>
            <TransactionForm
              key={t.id}
              initial={t}
              kinds={[t.kind]}
              submitLabel="Enregistrer"
              submitting={update.isPending}
              serverError={update.error ? errorMessage(update.error) : null}
              onSubmit={(input) => update.mutate({ id: t.id, ...input })}
              onCancel={onClose}
            />
            <div className={styles.secondary}>
              <Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
                Supprimer
              </Button>
              {t.status === 'planned' ? (
                <Button variant="secondary" size="sm" icon={<Check />} loading={confirm.isPending} onClick={() => confirm.mutate(t.id)}>
                  Confirmer sans modifier
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </Dialog>
      <Dialog
        open={t !== null && confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette opération ?"
        description="Les soldes du compte et de l'enveloppe sont recalculés. Cette action est définitive."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => t && remove.mutate(t.id)}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className={styles.name}>{t?.label}</p>
      </Dialog>
    </>
  );
}
