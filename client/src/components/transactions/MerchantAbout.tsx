import { Globe } from 'lucide-react';
import type { MerchantDetail } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { useClaudeTasks, useDescribeMerchantOnWeb, useMerchant } from '@/api/hooks';
import { Button, GroupLabel, Notice, Skeleton } from '@/components/ui';
import styles from './MerchantAbout.module.css';

const SOURCE_LABELS = { claude: 'd’après Claude', web: 'd’après le web', user: null } as const;

/** Pourquoi il n'y a pas de description : pas encore essayé, rien sur le web, ou pas reconnu par Claude. */
function missingText(m: MerchantDetail): string {
  if (m.describedAt === null) return 'Claude n’a pas encore décrit ce marchand.';
  if (m.descriptionSource === 'web') return 'Rien trouvé sur le web.';
  return 'Claude n’a pas reconnu ce marchand.';
}

/** « Qui c'est » : la description du marchand, et la recherche web quand Claude ne l'a pas reconnu ou qu'on veut mieux. */
export function MerchantAbout({ merchantKey }: { merchantKey: string }) {
  const merchant = useMerchant(merchantKey);
  const web = useDescribeMerchantOnWeb();
  // La recherche survit à la fermeture de la fiche : à la réouverture, le panneau de fond la signale encore.
  const tasks = useClaudeTasks();
  const searching = web.isPending || (tasks.data?.some((t) => t.kind === 'merchant_web' && t.subject === merchantKey && t.status === 'running') ?? false);
  const m = merchant.data;
  if (!m) return <Skeleton height={40} />;

  const text = searching ? 'Claude cherche sur le web…' : (m.description ?? missingText(m));
  const source = m.description && m.descriptionSource ? SOURCE_LABELS[m.descriptionSource] : null;

  return (
    <section aria-label="Qui c'est" className={styles.about}>
      <GroupLabel>Qui c'est</GroupLabel>
      <p className={m.description && !searching ? styles.description : styles.missing}>{text}</p>
      {source ? <p className={styles.source}>{source}</p> : null}
      {web.error ? <Notice tone="negative">{errorMessage(web.error)}</Notice> : null}
      {m.descriptionSource !== 'user' ? (
        <Button size="sm" variant="text" icon={<Globe />} loading={searching} disabled={searching} onClick={() => web.mutate(merchantKey)}>
          Chercher sur le web
        </Button>
      ) : null}
    </section>
  );
}
