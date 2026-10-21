import { Check, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useConfirmTransaction, useDeleteTransaction, useMerchant, useUpdateTransaction } from '@/api/hooks';
import { AllocationForm } from '@/components/envelopes/AllocationForm';
import { Button, ConfirmDialog, Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import { useMerchantHeading } from './MerchantHeading';
import { QuickEntry } from './QuickEntry';
import { TransactionSheet } from './TransactionSheet';

type TransactionEditDialogProps = { transaction: Transaction | null; onClose: () => void };

/** La fiche s'ouvre pour ce qu'on a vraiment dépensé ou reçu ; prévues et répartitions vont droit au formulaire. */
export const opensSheet = (t: Transaction) => t.status === 'confirmed' && t.kind !== 'allocation';

/** Dialogue d'une opération : fiche de consultation par défaut, formulaire d'édition derrière « Modifier ». */
export function TransactionEditDialog({ transaction, onClose }: TransactionEditDialogProps) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [current, setCurrent] = useState<Transaction | null>(transaction);
  const [mode, setMode] = useState<'view' | 'edit'>(transaction && opensSheet(transaction) ? 'view' : 'edit');
  const [lastOpened, setLastOpened] = useState(transaction);
  if (lastOpened !== transaction) {
    setLastOpened(transaction);
    setCurrent(transaction);
    setMode(transaction && opensSheet(transaction) ? 'view' : 'edit');
  }

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
  // Annuler dans le formulaire revient à la fiche si on venait d'elle, ferme sinon.
  const cancelEdit = (x: Transaction) => () => (opensSheet(x) ? setMode('view') : close());

  const t = current;
  const accountList = useAccounts();
  const accounts = useMemo(() => new Map((accountList.data ?? []).map((a) => [a.id, a])), [accountList.data]);
  // Le nom suit le marchand en cache : il change dès qu'on le renomme, sans rouvrir le dialogue.
  const merchant = useMerchant(t?.merchantKey ?? null);
  const merchantHeading = useMerchantHeading(t?.merchantKey ?? null);
  const title = !t
    ? ''
    : t.merchantKey
      ? merchant.data?.name ?? displayLabel(t)
      : mode === 'edit'
        ? `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}`
        : displayLabel(t, accounts);
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
        description={mode === 'edit' && t?.status === 'planned' ? 'Opération prévue par une règle récurrente, pas encore passée en banque.' : undefined}
        headerAction={mode === 'edit' ? merchantHeading.action : null}
        size={t?.kind === 'allocation' ? 'md' : 'lg'}
      >
        {t ? (
          mode === 'view' ? (
            <TransactionSheet
              key={t.id}
              transaction={t}
              onEdit={() => setMode('edit')}
              onOpen={(x) => {
                setCurrent(x);
                setMode(opensSheet(x) ? 'view' : 'edit');
              }}
            />
          ) : t.kind === 'allocation' ? (
            <AllocationForm
              key={t.id}
              initial={t}
              submitLabel="Enregistrer"
              submitting={update.isPending}
              serverError={serverError}
              onSubmit={(input) => update.mutate({ id: t.id, ...input })}
              onCancel={cancelEdit(t)}
              footerStart={deleteButton}
            />
          ) : (
            <>
              {merchantHeading.form}
              <QuickEntry
                key={t.id}
                mode="edit"
                initial={t}
                submitting={update.isPending}
                serverError={serverError}
                onSubmit={(input) => update.mutate({ id: t.id, ...input })}
                onReconciled={close}
                onCancel={cancelEdit(t)}
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
