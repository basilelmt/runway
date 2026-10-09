import { GripVertical } from 'lucide-react';
import styles from './DragHandle.module.css';

type DragHandleProps = {
  /** Nom accessible, avec la consigne clavier : « Déplacer … dans la liste (flèches haut et bas) ». */
  label: string;
  /** Flèche haut : -1, flèche bas : 1. */
  onMove: (delta: -1 | 1) => void;
};

/**
 * Poignée de glisser d'une ligne réordonnable : dans la marge à gauche de la ligne sur ordinateur, visible
 * au survol de la ligne (`dragRow.row`) ou au focus, toujours visible sur écran tactile. Au clavier, les
 * flèches haut et bas déplacent la ligne.
 */
export function DragHandle({ label, onMove }: DragHandleProps) {
  return (
    <button
      type="button"
      className={styles.handle}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          onMove(e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      <GripVertical aria-hidden />
    </button>
  );
}

/** Classes de la ligne qui porte la poignée : `row` toujours, `dragging` pendant le glisser, `over` sur la cible. */
export const dragRow = { row: styles.row, dragging: styles.dragging, over: styles.over };
