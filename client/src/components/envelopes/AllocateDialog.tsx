import { errorMessage } from '@/api/client';
import { useCreateTransaction } from '@/api/hooks';
import { Dialog, useToast } from '@/components/ui';
import { AllocationForm } from './AllocationForm';

type AllocateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Enveloppe à remplir (ajout d'argent). */
  envelopeId?: number | null;
  /** Enveloppe à vider (déplacement). */
  fromEnvelopeId?: number | null;
  envelopeName?: string;
};

/** Répartition ponctuelle : de "Pas encore réparti" vers une enveloppe, ou d'une enveloppe à une autre. */
export function AllocateDialog({ open, onClose, envelopeId = null, fromEnvelopeId = null, envelopeName }: AllocateDialogProps) {
  const toast = useToast();
  const moving = fromEnvelopeId !== null;
  const create = useCreateTransaction({
    onSuccess: () => {
      toast.success(moving ? 'Argent déplacé' : 'Argent ajouté');
      onClose();
    },
  });
  const title = moving ? `Déplacer depuis ${envelopeName ?? 'l’enveloppe'}` : envelopeName ? `Ajouter de l’argent à ${envelopeName}` : 'Ajouter de l’argent';
  return (
    <Dialog open={open} onClose={onClose} title={title} description={moving ? 'Choisis l’enveloppe qui reçoit l’argent.' : 'L’argent vient de « Pas encore réparti ». Aucun compte ne bouge.'}>
      {open ? (
        <AllocationForm
          initial={{ envelopeId: moving ? null : envelopeId, fromEnvelopeId, label: moving ? 'Déplacement' : 'Répartition' }}
          submitLabel={moving ? 'Déplacer' : 'Ajouter'}
          submitting={create.isPending}
          serverError={create.error ? errorMessage(create.error) : null}
          onSubmit={(input) => create.mutate(input)}
          onCancel={onClose}
        />
      ) : null}
    </Dialog>
  );
}
