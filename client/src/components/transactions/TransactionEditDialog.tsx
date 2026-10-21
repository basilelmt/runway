import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Account, Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccountMap, useConfirmTransaction, useDeleteTransaction, useMerchant, useUpdateTransaction } from '@/api/hooks';
import { AllocationForm } from '@/components/envelopes/AllocationForm';
import { Button, ConfirmDialog, Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { displayLabel } from '@/lib/merchants';
import { useMerchantHeading } from './MerchantHeading';
import { opensSheet } from './opensSheet';
import { QuickEntry } from './QuickEntry';
import { TransactionSheet } from './TransactionSheet';

type TransactionEditDialogProps = { transaction: Transaction | null; onClose: () => void };

/** Navigation dans le dialogue : l'opération affichée et son mode, valables tant que `opened` est l'opération ouverte. */
type Nav = { opened: Transaction | null; shown: Transaction; editing: boolean };
/** Le marchand quand il y en a un ; sinon le libellé en fiche, et le type d'opération dans le formulaire. */
function dialogTitle(t: Transaction, mode: 'view' | 'edit', merchantName: string | undefined, accounts: Map<number, Account>): string {
  if (t.merchantKey) return merchantName ?? displayLabel(t);
  if (mode === 'edit') return `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}`;
  return displayLabel(t, accounts);
}

/** Dialogue d'une opération : fiche de consultation par défaut, formulaire d'édition derrière « Modifier ». */
export function TransactionEditDialog({ transaction, onClose }: TransactionEditDialogProps) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  // Une autre opération ouverte depuis la page repart de zéro : sa fiche, ou son formulaire si elle n'a pas de fiche.
  const view = nav && nav.opened === transaction ? nav : transaction ? { shown: transaction, editing: !opensSheet(transaction) } : null;
  const t = view?.shown ?? null;
  const mode = view?.editing ? 'edit' : 'view';
  const show = (shown: Transaction, editing = !opensSheet(shown)) => setNav({ opened: transaction, shown, editing });
  // La page peut rouvrir le même objet : la navigation d'une ouverture ne doit pas survivre à la fermeture.
  const finish = () => {
    setNav(null);
    onClose();
  };

  const update = useUpdateTransaction({
    onSuccess: () => {
      toast.success('Opération modifiée');
      finish();
    },
  });
  const confirm = useConfirmTransaction({
    onSuccess: () => {
      toast.success('Opération confirmée');
      finish();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useDeleteTransaction({
    onSuccess: () => {
      toast.success('Opération supprimée');
      setConfirmDelete(false);
      finish();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Une erreur d'enregistrement ne doit pas réapparaître à l'ouverture d'une autre opération.
  const close = () => {
    update.reset();
    finish();
  };
  // Annuler dans le formulaire revient à la fiche si on venait d'elle, ferme sinon.
  const cancelEdit = (x: Transaction) => () => (opensSheet(x) ? show(x, false) : close());

  const accounts = useAccountMap();
  // Le nom suit le marchand en cache : il change dès qu'on le renomme, sans rouvrir le dialogue.
  const merchant = useMerchant(t?.merchantKey ?? null);
  const merchantHeading = useMerchantHeading(t?.merchantKey ?? null);
  const title = !t ? '' : dialogTitle(t, mode, merchant.data?.name, accounts);
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
              onEdit={() => show(t, true)}
              onOpen={(x) => show(x)}
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
