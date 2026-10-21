import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { errorMessage } from '@/api/client';
import { useMerchant, useRenameMerchant } from '@/api/hooks';
import { Button, Field, Input, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './MerchantHeading.module.css';

type MerchantHeading = {
  /** Bouton discret pour la ligne de titre du dialogue ; `null` tant qu'il n'y a pas de marchand ou pendant le renommage. */
  action: ReactNode;
  /** Formulaire de renommage en place, à afficher sous l'en-tête du dialogue ; `null` hors renommage. */
  form: ReactNode;
};

type MerchantDraft = { name: string; description: string };

/** Renommage et description du marchand pour toutes ses opérations ; le libellé brut reste visible dans le champ libellé du formulaire. */
export function useMerchantHeading(merchantKey: string | null): MerchantHeading {
  const toast = useToast();
  const merchant = useMerchant(merchantKey);
  const [draft, setDraft] = useState<MerchantDraft | null>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  // Le focus ne peut revenir sur le bouton Modifier le marchand qu'une fois le formulaire démonté.
  const pendingFocus = useRef(false);
  const rename = useRenameMerchant({
    onSuccess: (m) => {
      toast.success(m.source === 'user' ? 'Marchand modifié' : 'Claude renommera ce marchand');
      setDraft(null);
    },
  });

  useEffect(() => {
    if (draft === null && pendingFocus.current) {
      pendingFocus.current = false;
      renameButtonRef.current?.focus();
    }
  }, [draft]);

  // Une opération différente (autre marchand, ou dialogue refermé) ne doit pas garder un renommage en cours.
  const [lastMerchantKey, setLastMerchantKey] = useState(merchantKey);
  if (lastMerchantKey !== merchantKey) {
    setLastMerchantKey(merchantKey);
    if (draft !== null) setDraft(null);
  }

  function cancelRename() {
    rename.reset();
    pendingFocus.current = true;
    setDraft(null);
  }

  if (merchantKey === null) return { action: null, form: null };

  if (draft === null) {
    const action = (
      <Button
        ref={renameButtonRef}
        size="sm"
        variant="ghost"
        icon={<Pencil />}
        className={styles.renameButton}
        onClick={() => setDraft({ name: merchant.data?.name ?? '', description: merchant.data?.description ?? '' })}
      >
        Modifier le marchand
      </Button>
    );
    return { action, form: null };
  }

  const count = merchant.data?.transactionCount;
  const scope = count === undefined ? 'toutes les opérations de ce marchand' : `toutes les opérations de ce marchand (${plural(count, 'opération')})`;
  const form = (
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
        rename.mutate({ key: merchantKey, name: draft.name.trim(), description: draft.description.trim() });
      }}
    >
      <Field label="Nom du marchand" hint={`Le nom et la description vaudront pour ${scope}.`} error={rename.error ? errorMessage(rename.error) : null}>
        {(id, describedBy) => (
          <Input id={id} aria-describedby={describedBy} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} autoFocus />
        )}
      </Field>
      <Field label="Description" hint="Ce qu'est ce marchand, en une phrase. Vide pour laisser Claude le décrire.">
        {(id, describedBy) => (
          <Input id={id} aria-describedby={describedBy} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={140} />
        )}
      </Field>
      <div className={styles.actions}>
        <Button size="sm" variant="ghost" onClick={cancelRename}>
          Annuler
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={rename.isPending}>
          Enregistrer le marchand
        </Button>
      </div>
    </form>
  );
  return { action: null, form };
}
