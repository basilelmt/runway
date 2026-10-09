import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { useMerchant, useRenameMerchant } from '@/api/hooks';
import { Button, Field, Input, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './MerchantHeading.module.css';

type MerchantHeadingProps = { merchantKey: string; label: string };

/** Libellé brut sous le nom du marchand, et renommage du marchand pour toutes ses opérations. */
export function MerchantHeading({ merchantKey, label }: MerchantHeadingProps) {
  const toast = useToast();
  const merchant = useMerchant(merchantKey);
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useRenameMerchant({
    onSuccess: (m) => {
      toast.success(m.source === 'user' ? 'Marchand renommé' : 'Claude renommera ce marchand');
      setDraft(null);
    },
  });

  if (draft === null) {
    return (
      <div className={styles.heading}>
        <p className={styles.label} title={label}>
          {label}
        </p>
        <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setDraft(merchant.data?.name ?? '')}>
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
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate({ key: merchantKey, name: draft.trim() });
      }}
    >
      <Field label="Nom du marchand" hint={`Le nouveau nom vaudra pour ${scope}. Vide pour laisser Claude le nommer.`} error={rename.error ? errorMessage(rename.error) : null}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} autoFocus />}
      </Field>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            rename.reset();
            setDraft(null);
          }}
        >
          Annuler
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={rename.isPending}>
          Enregistrer le nom
        </Button>
      </div>
    </form>
  );
}
