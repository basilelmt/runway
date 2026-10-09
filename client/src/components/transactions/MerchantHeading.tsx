import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { errorMessage } from '@/api/client';
import { useMerchant, useRenameMerchant } from '@/api/hooks';
import { Button, Field, Input, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './MerchantHeading.module.css';

type MerchantHeadingProps = { merchantKey: string };

/** Renommage du marchand pour toutes ses opérations ; le libellé brut reste visible dans le champ libellé du formulaire. */
export function MerchantHeading({ merchantKey }: MerchantHeadingProps) {
  const toast = useToast();
  const merchant = useMerchant(merchantKey);
  const [draft, setDraft] = useState<string | null>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  // Le focus ne peut revenir sur le bouton Renommer qu'une fois le formulaire démonté.
  const pendingFocus = useRef(false);
  const rename = useRenameMerchant({
    onSuccess: (m) => {
      toast.success(m.source === 'user' ? 'Marchand renommé' : 'Claude renommera ce marchand');
      setDraft(null);
    },
  });

  useEffect(() => {
    if (draft === null && pendingFocus.current) {
      pendingFocus.current = false;
      renameButtonRef.current?.focus();
    }
  }, [draft]);

  function cancelRename() {
    rename.reset();
    pendingFocus.current = true;
    setDraft(null);
  }

  if (draft === null) {
    return (
      <div className={styles.heading}>
        <Button ref={renameButtonRef} size="sm" variant="ghost" icon={<Pencil />} onClick={() => setDraft(merchant.data?.name ?? '')}>
          Renommer
        </Button>
      </div>
    );
  }

  const count = merchant.data?.transactionCount;
  const scope = count === undefined ? 'toutes les opérations de ce marchand' : `toutes les opérations de ce marchand (${plural(count, 'opération')})`;
  return (
    <form
      className={styles.form}
      noValidate
      onKeyDown={(e: KeyboardEvent<HTMLFormElement>) => {
        // Échap annule le renommage sans fermer le dialogue englobant (qui se fermerait sinon sur son événement `cancel`).
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        cancelRename();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate({ key: merchantKey, name: draft.trim() });
      }}
    >
      <Field label="Nom du marchand" hint={`Le nouveau nom vaudra pour ${scope}. Vide pour laisser Claude le nommer.`} error={rename.error ? errorMessage(rename.error) : null}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} autoFocus />}
      </Field>
      <div className={styles.actions}>
        <Button size="sm" variant="ghost" onClick={cancelRename}>
          Annuler
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={rename.isPending}>
          Enregistrer le nom
        </Button>
      </div>
    </form>
  );
}
