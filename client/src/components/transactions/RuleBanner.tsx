import { useState } from 'react';
import { suggestPattern } from '@core/sorting';
import { errorMessage } from '@/api/client';
import { useCreateSortingRule } from '@/api/hooks';
import { Button, Input, Notice, useToast } from '@/components/ui';
import { keepTogether } from '@/lib/format';
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
    <Notice
      tone="marking"
      label="Créer une règle de tri"
      action={
        <>
          <Button size="sm" variant="secondary" loading={create.isPending} disabled={pattern.trim().length < 2} onClick={() => create.mutate({ pattern: pattern.trim(), envelopeId })}>
            Créer la règle
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Non merci
          </Button>
        </>
      }
    >
      <span className={styles.sentence}>
        Toujours ranger les libellés contenant
        <Input aria-label="Motif de la règle" value={pattern} onChange={(e) => setPattern(e.target.value)} className={styles.pattern} />
        <span>
          dans <strong>{envelopeName}</strong>
          {keepTogether(' ?')}
        </span>
      </span>
    </Notice>
  );
}
