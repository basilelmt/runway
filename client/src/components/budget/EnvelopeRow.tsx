import type { ReactNode } from 'react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { Amount, ColumnHeader, Dot, ListRow, ProgressBar, type ListRowClick, RowMenu, type RowMenuItem } from '@/components/ui';
import { askTarget } from '@/components/ask/ask-target';
import styles from './EnvelopeRow.module.css';

type EnvelopeRowProps = {
  envelope: EnvelopeWithBalance;
  /** Actions du menu ⋯ (Budget) ; absent sur l'accueil. */
  menu?: RowMenuItem[];
  /** Poignée de réordonnancement. */
  leading?: ReactNode;
  /** Clic sur la ligne : ouvre le détail des dépenses de l'enveloppe. */
  onOpen?: () => void;
  className?: string;
};

/** Intitulés de colonnes, sur la même grille que les lignes. */
export function EnvelopeRowHeader({ withActions = false, spentLabel = 'Dépensé ce mois' }: { withActions?: boolean; spentLabel?: string }) {
  return <ColumnHeader title="Enveloppe" middle={`${spentLabel} / budget`} trail="Disponible" actions={withActions} />;
}

/** Une enveloppe en une ligne : dépensé du mois face à son budget, et ce qu'il reste dedans. */
export function EnvelopeRow({ envelope, menu, leading, onOpen, className }: EnvelopeRowProps) {
  const target = envelope.monthlyBudget > 0 ? envelope.monthlyBudget : null;
  const ratio = target ? envelope.spentThisMonth / target : 0;
  const over = target !== null && envelope.spentThisMonth > target;
  const verb = envelope.isSavings ? 'versés' : 'dépensés';
  const click: ListRowClick = onOpen ? { onClick: onOpen, clickLabel: `Voir les dépenses de ${envelope.name}` } : {};

  return (
    <ListRow
      as="div"
      className={className}
      data={askTarget('envelope', envelope.id, `Enveloppe ${envelope.name}`)}
      {...click}
      lead={
        <>
          {leading}
          <Dot color={envelope.color} />
        </>
      }
      title={envelope.name}
      middle={
        <>
          {target ? (
            <ProgressBar ratio={ratio} color={envelope.color} label={`${envelope.name} : ${formatEuros(envelope.spentThisMonth)} ${verb} sur ${formatEuros(target)}`} />
          ) : (
            <span className={styles.noBudget}>Sans budget</span>
          )}
          <span className={['num', styles.spent, over ? styles.over : ''].join(' ')}>
            {formatEuros(envelope.spentThisMonth)}
            {target ? <span className={styles.target}> / {formatEuros(target)}</span> : <span className={styles.target}> {verb}</span>}
          </span>
        </>
      }
      trail={<Amount cents={envelope.balance} />}
      trailSub={envelope.balance < 0 ? 'dépassé' : 'disponible'}
      actions={menu ? <RowMenu label={`Actions pour ${envelope.name}`} items={menu} /> : undefined}
    />
  );
}
