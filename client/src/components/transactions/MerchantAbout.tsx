import { Globe } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { useDescribeMerchantOnWeb, useMerchant } from '@/api/hooks';
import { Button, Notice, Skeleton } from '@/components/ui';
import styles from './MerchantAbout.module.css';

const SOURCE_LABELS = { claude: 'd’après Claude', web: 'd’après le web', user: null } as const;

/** « Qui c'est » : la description du marchand, et la recherche web quand Claude ne l'a pas reconnu ou qu'on veut mieux. */
export function MerchantAbout({ merchantKey }: { merchantKey: string }) {
  const merchant = useMerchant(merchantKey);
  const web = useDescribeMerchantOnWeb();
  const m = merchant.data;
  if (!m) return <Skeleton height={40} />;

  const text = web.isPending
    ? 'Claude cherche sur le web…'
    : m.description ?? (m.describedAt === null ? 'Claude n’a pas encore décrit ce marchand.' : m.descriptionSource === 'web' ? 'Rien trouvé sur le web.' : 'Claude n’a pas reconnu ce marchand.');
  const source = m.description && m.descriptionSource ? SOURCE_LABELS[m.descriptionSource] : null;

  return (
    <section aria-label="Qui c'est" className={styles.about}>
      <h3 className={styles.heading}>Qui c'est</h3>
      <p className={m.description && !web.isPending ? styles.description : styles.missing}>{text}</p>
      {source ? <p className={styles.source}>{source}</p> : null}
      {web.error ? <Notice tone="negative">{errorMessage(web.error)}</Notice> : null}
      {m.descriptionSource !== 'user' ? (
        <Button size="sm" variant="ghost" icon={<Globe />} loading={web.isPending} onClick={() => web.mutate(merchantKey)}>
          Chercher sur le web
        </Button>
      ) : null}
    </section>
  );
}
