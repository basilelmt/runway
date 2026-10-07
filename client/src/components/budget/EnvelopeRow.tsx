import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { Amount, Dot, ProgressBar } from '@/components/ui';
import styles from './EnvelopeRow.module.css';

type EnvelopeRowProps = {
  envelope: EnvelopeWithBalance;
  /** Actions à droite (Budget) ; absentes sur l'accueil. */
  actions?: ReactNode;
  leading?: ReactNode;
  /** Sur mobile, les actions laissent place à un bouton qui ouvre ce menu. */
  onMore?: () => void;
  /** Clic sur la ligne : ouvre le détail des dépenses de l'enveloppe. */
  onOpen?: () => void;
  className?: string;
};

/** Intitulés de colonnes, sur la même grille que les lignes. */
export function EnvelopeRowHeader({ withActions = false, spentLabel = 'Dépensé ce mois' }: { withActions?: boolean; spentLabel?: string }) {
  return (
    <div className={[styles.row, styles.header, withActions ? styles.withActions : ''].join(' ')} aria-hidden>
      <span>Enveloppe</span>
      <span className={styles.headerSpent}>{spentLabel} / budget</span>
      <span className={styles.headerRight}>Disponible</span>
      {withActions ? <span /> : null}
    </div>
  );
}

/** Une enveloppe en une ligne : dépensé du mois face à son budget, et ce qu'il reste dedans. */
export function EnvelopeRow({ envelope, actions, leading, onMore, onOpen, className }: EnvelopeRowProps) {
  const target = envelope.monthlyTarget;
  const ratio = target ? envelope.spentThisMonth / target : 0;
  const over = target !== null && envelope.spentThisMonth > target;
  const verb = envelope.isSavings ? 'versés' : 'dépensés';

  return (
    <div className={['hover-row', styles.row, actions ? styles.withActions : '', onOpen ? styles.clickable : '', className ?? ''].join(' ')}>
      {/* Bouton qui couvre toute la ligne ; les actions passent au-dessus. */}
      {onOpen ? <button type="button" className={styles.open} onClick={onOpen} aria-label={`Voir les dépenses de ${envelope.name}`} /> : null}
      <div className={styles.name}>
        {leading}
        <Dot color={envelope.color} />
        <span className={styles.label}>{envelope.name}</span>
      </div>

      <div className={styles.meter}>
        {target ? (
          <ProgressBar ratio={ratio} color={envelope.color} label={`${envelope.name} : ${formatEuros(envelope.spentThisMonth)} ${verb} sur ${formatEuros(target)}`} />
        ) : (
          <span className={styles.noBudget}>Sans budget</span>
        )}
        <span className={['num', styles.spent, over ? styles.over : ''].join(' ')}>
          {formatEuros(envelope.spentThisMonth)}
          {target ? <span className={styles.target}> / {formatEuros(target)}</span> : <span className={styles.target}> {verb}</span>}
        </span>
      </div>

      <div className={styles.available}>
        <Amount cents={envelope.balance} />
        <span className={styles.availableLabel}>{envelope.balance < 0 ? 'dépassé' : 'disponible'}</span>
      </div>

      {onMore ? (
        <button type="button" className={styles.more} onClick={onMore} aria-label={`Actions pour ${envelope.name}`}>
          <MoreHorizontal aria-hidden />
        </button>
      ) : null}

      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
