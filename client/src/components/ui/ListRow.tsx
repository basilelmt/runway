import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import styles from './ListRow.module.css';

type ListRowProps = {
  /** Début : date, point, icône. */
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Milieu facultatif : progression. */
  middle?: ReactNode;
  /** Fin : montant. */
  trail?: ReactNode;
  /** Sous le montant, plus petit. */
  trailSub?: ReactNode;
  /** En général un RowMenu. */
  actions?: ReactNode;
  compact?: boolean;
  /** Opération prévue : la fin est atténuée. */
  muted?: boolean;
  onClick?: () => void;
  clickLabel?: string;
  /** Ligne choisie parmi d'autres (série tracée...) : annoncée par `aria-pressed`, seulement avec `onClick`. */
  pressed?: boolean;
  as?: 'li' | 'div';
  className?: string;
};

/** La ligne de liste de l'app : à placer dans un `<ul className="ledger">`. */
export function ListRow({ lead, title, meta, middle, trail, trailSub, actions, compact = false, muted = false, onClick, clickLabel, pressed, as: Tag = 'li', className }: ListRowProps) {
  return (
    <Tag className={[styles.row, compact ? styles.compact : '', muted ? styles.muted : '', onClick ? 'hover-row' : '', className ?? ''].join(' ')}>
      {/* Bouton qui couvre toute la ligne ; les actions passent au-dessus. */}
      {onClick ? <button type="button" className={styles.open} onClick={onClick} aria-label={clickLabel} aria-pressed={pressed} /> : null}
      {lead ? <span className={styles.lead}>{lead}</span> : null}
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {middle ? <span className={styles.middle}>{middle}</span> : null}
      {trail !== undefined || trailSub ? (
        <span className={styles.trail}>
          {trail}
          {trailSub ? <span className={styles.trailSub}>{trailSub}</span> : null}
        </span>
      ) : null}
      {actions ? <span className={styles.actions}>{actions}</span> : null}
    </Tag>
  );
}

/** Date en début de ligne, en colonne alignée. */
export const listRowDate = styles.date;

type ListRowSkeletonProps = { rows?: number; compact?: boolean; meta?: boolean; middle?: boolean; actions?: boolean };

/** Chargement d'une liste : mêmes hauteurs que les vraies lignes, la page ne saute pas. */
export function ListRowSkeleton({ rows = 4, compact = false, meta = !compact, middle = false, actions = false }: ListRowSkeletonProps) {
  return (
    <div className="ledger" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={[styles.row, compact ? styles.compact : ''].join(' ')}>
          <span className={styles.body}>
            <Skeleton width={`${38 + ((i * 17) % 28)}%`} height={14} />
            {meta ? <Skeleton width={`${16 + ((i * 7) % 12)}%`} height={10} /> : null}
          </span>
          {middle ? (
            <span className={styles.middle}>
              <Skeleton height={6} />
            </span>
          ) : null}
          <span className={styles.trail}>
            <Skeleton width={64 + ((i * 11) % 24)} height={14} />
          </span>
          {actions ? <span className={styles.actions} /> : null}
        </div>
      ))}
    </div>
  );
}

type ColumnHeaderProps = { title: ReactNode; middle?: ReactNode; trail?: ReactNode; actions?: boolean };

/** Intitulés de colonnes, sur la même grille que les lignes. */
export function ColumnHeader({ title, middle, trail, actions = false }: ColumnHeaderProps) {
  return (
    <div className={[styles.row, styles.header].join(' ')} aria-hidden="true">
      <span className={styles.body}>{title}</span>
      {middle ? <span className={[styles.middle, styles.headerEnd].join(' ')}>{middle}</span> : null}
      {trail ? <span className={styles.trail}>{trail}</span> : null}
      {actions ? <span className={styles.actions} /> : null}
    </div>
  );
}

/** Libellé au-dessus d'un groupe de lignes (un jour, une catégorie). */
export function GroupLabel({ as: Tag = 'h3', children }: { as?: 'h2' | 'h3' | 'p'; children: ReactNode }) {
  return <Tag className={styles.group}>{children}</Tag>;
}
