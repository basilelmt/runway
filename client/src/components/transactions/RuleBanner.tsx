import { useState } from 'react';
import { suggestPattern } from '@core/sorting';
import { errorMessage } from '@/api/client';
import { useCreateSortingRule } from '@/api/hooks';
import { Button, Input, useToast } from '@/components/ui';
import styles from './RuleBanner.module.css';

type RuleBannerProps = {
  label: string;
  envelopeId: number;
  envelopeName: string;
  onDone: () => void;
};

/** Après un tri manuel : propose de transformer ce choix en règle réutilisable. */
export function RuleBanner({ label, envelopeId, envelopeName, onDone }: RuleBannerProps) {
  const toast = useToast();
  const [pattern, setPattern] = useState(() => suggestPattern(label));
  const create = useCreateSortingRule({
    onSuccess: () => {
      toast.success(`Règle créée : "${pattern}" → ${envelopeName}`);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className={styles.banner} role="group" aria-label="Créer une règle de tri">
      <span className={styles.text}>Toujours ranger les libellés contenant</span>
      <Input aria-label="Motif de la règle" value={pattern} onChange={(e) => setPattern(e.target.value)} className={styles.pattern} />
      <span className={styles.text}>
        dans <strong>{envelopeName}</strong> ?
      </span>
      <div className={styles.actions}>
        <Button size="sm" variant="primary" loading={create.isPending} disabled={pattern.trim().length < 2} onClick={() => create.mutate({ pattern: pattern.trim(), envelopeId })}>
          Créer la règle
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Non merci
        </Button>
      </div>
    </div>
  );
}
