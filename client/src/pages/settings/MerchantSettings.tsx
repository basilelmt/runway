import { Sparkles } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { useMerchantStatus, useNameMerchants } from '@/api/hooks';
import { Button, Notice, PulseDot, SectionHeader, Skeleton, useToast } from '@/components/ui';
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
      <SectionHeader
        title="Marchands"
        description={
          <>
            Runway tire un marchand de chaque libellé, et Claude lui donne un nom lisible une fois pour toutes.
            <br />
            Un nom que tu choisis dans une opération n’est jamais remplacé.
          </>
        }
        aside={
          <Button size="sm" icon={<Sparkles />} loading={data?.running || name.isPending} disabled={!data} onClick={() => name.mutate()}>
            Nommer avec Claude
          </Button>
        }
      />
      {!data ? (
        <Skeleton width={180} height={14} />
      ) : (
        <div className="stack">
          <p className={styles.text}>{`${plural(data.total, 'marchand')}, ${plural(data.named, 'nommé')}`}</p>
          {data.running ? (
            <Notice tone="neutral" icon={<PulseDot />} role="status">
              Claude nomme les nouveaux marchands…
            </Notice>
          ) : null}
          {data.lastError && !data.running ? <Notice tone="negative">{data.lastError}</Notice> : null}
        </div>
      )}
    </section>
  );
}
