import { errorMessage } from '@/api/client';
import { useCreateTransaction } from '@/api/hooks';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Dialog, useToast } from '@/components/ui';

type AllocateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Enveloppe à remplir (mode "Allouer"). */
  envelopeId?: number | null;
  /** Enveloppe à vider (mode "Déplacer"). */
  fromEnvelopeId?: number | null;
  envelopeName?: string;
};

/** Allocation d'argent : depuis "À répartir" vers une enveloppe, ou d'une enveloppe à une autre. */
export function AllocateDialog({ open, onClose, envelopeId = null, fromEnvelopeId = null, envelopeName }: AllocateDialogProps) {
  const toast = useToast();
  const moving = fromEnvelopeId !== null;
  const create = useCreateTransaction({
    onSuccess: () => {
      toast.success(moving ? 'Argent déplacé' : 'Argent alloué');
      onClose();
    },
  });
  const title = moving ? `Déplacer depuis ${envelopeName ?? "l'enveloppe"}` : envelopeName ? `Allouer à ${envelopeName}` : 'Allouer de l’argent';
  return (
    <Dialog open={open} onClose={onClose} title={title} description={moving ? 'Choisis l’enveloppe qui reçoit l’argent.' : 'L’argent part de "À répartir", aucun compte ne bouge.'}>
      {open ? (
        <TransactionForm
          kinds={['allocation']}
          initial={{ kind: 'allocation', envelopeId: moving ? null : envelopeId, fromEnvelopeId, label: moving ? 'Déplacement' : 'Allocation' }}
          submitLabel={moving ? 'Déplacer' : 'Allouer'}
          submitting={create.isPending}
          serverError={create.error ? errorMessage(create.error) : null}
          onSubmit={(input) => create.mutate(input)}
          onCancel={onClose}
        />
      ) : null}
    </Dialog>
  );
}
