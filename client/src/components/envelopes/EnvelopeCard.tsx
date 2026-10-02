import { Archive, ArrowDown, ArrowRightLeft, ArrowUp, GripVertical, Pencil, Plus } from 'lucide-react';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { Amount, Button, Card, Dot, ProgressBar } from '@/components/ui';
import styles from './EnvelopeCard.module.css';

type EnvelopeCardProps = {
  envelope: EnvelopeWithBalance;
  onAllocate: () => void;
  onMove: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart: () => void;
  onDragOver: (e: { preventDefault(): void }) => void;
  onDrop: () => void;
  onDragEnd: () => void;
};

export function EnvelopeCard({
  envelope,
  onAllocate,
  onMove,
  onEdit,
  onArchive,
  onMoveUp,
  onMoveDown,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: EnvelopeCardProps) {
  const target = envelope.monthlyTarget;
  const ratio = target ? envelope.allocatedThisMonth / target : 0;
  const negative = envelope.balance < 0;

  return (
    <li
      className={[styles.item, dragging ? styles.dragging : '', dragOver ? styles.dragOver : ''].join(' ')}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <Card padding="none" tone={negative ? 'negative' : 'raised'} className={styles.card}>
        <header className={styles.header}>
          <span className={styles.grip} aria-hidden>
            <GripVertical />
          </span>
          <Dot color={envelope.color} size={12} />
          <h3 className={styles.name}>{envelope.name}</h3>
          <div className={styles.order}>
            {onMoveUp ? <Button variant="ghost" size="sm" icon={<ArrowUp />} onClick={onMoveUp} aria-label={`Monter ${envelope.name}`} /> : null}
            {onMoveDown ? <Button variant="ghost" size="sm" icon={<ArrowDown />} onClick={onMoveDown} aria-label={`Descendre ${envelope.name}`} /> : null}
          </div>
        </header>

        <div className={styles.balance}>
          <Amount cents={envelope.balance} size="lg" />
          <span className={styles.balanceLabel}>{negative ? 'dépassé' : 'disponible'}</span>
        </div>

        {target ? (
          <div className={styles.target}>
            <ProgressBar ratio={ratio} color={envelope.color} label={`Allocation du mois pour ${envelope.name}`} />
            <div className={styles.targetLine}>
              <span>
                <Amount cents={envelope.allocatedThisMonth} size="sm" tone="neutral" /> alloués sur <Amount cents={target} size="sm" tone="neutral" />
              </span>
              <span className={styles.percent}>{Math.round(ratio * 100)} %</span>
            </div>
          </div>
        ) : null}

        <p className={styles.spent}>
          Dépensé ce mois <Amount cents={envelope.spentThisMonth} size="sm" tone="neutral" />
        </p>

        <footer className={styles.actions}>
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={onAllocate}>
            Allouer
          </Button>
          <Button size="sm" variant="ghost" icon={<ArrowRightLeft />} onClick={onMove}>
            Déplacer
          </Button>
          <span className={styles.spacer} />
          <Button size="sm" variant="ghost" icon={<Pencil />} onClick={onEdit} aria-label={`Modifier ${envelope.name}`} />
          <Button size="sm" variant="ghost" icon={<Archive />} onClick={onArchive} aria-label={`Archiver ${envelope.name}`} />
        </footer>
      </Card>
    </li>
  );
}
