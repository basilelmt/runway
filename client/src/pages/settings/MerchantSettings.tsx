import { Sparkles } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { useMerchantStatus, useNameMerchants } from '@/api/hooks';
import { Button, SkeletonRows, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './Settings.module.css';

/** Section « Marchands » : combien sont nommés, nommage à la demande et dernière erreur de Claude. */
export function MerchantSettings() {
  const toast = useToast();
  const status = useMerchantStatus();
  const name = useNameMerchants({ onError: (e) => toast.error(errorMessage(e)) });
  const data = status.data;

  return (
    <section className={styles.section}>
      <div className={styles.aside}>
        <h2>Marchands</h2>
        <p>Runway tire un marchand de chaque libellé, et Claude lui donne un nom lisible une fois pour toutes.</p>
        <p>Un nom que tu choisis dans une opération n’est jamais remplacé.</p>
      </div>
      <div className={styles.content}>
        {!data ? (
          <SkeletonRows rows={2} />
        ) : (
          <>
            <p className={styles.text}>{`${plural(data.total, 'marchand')}, ${plural(data.named, 'nommé')}`}</p>
            {data.running ? (
              <p className={styles.status} aria-live="polite">
                Claude nomme les nouveaux marchands…
              </p>
            ) : null}
            {data.lastError && !data.running ? (
              <p className={styles.error} role="alert">
                {data.lastError}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button icon={<Sparkles />} loading={data.running || name.isPending} onClick={() => name.mutate()}>
                Nommer avec Claude
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
