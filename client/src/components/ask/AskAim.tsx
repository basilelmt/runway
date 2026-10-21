import { Crosshair } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useAsk } from './ask-context';
import { ASK_UI, askUi, findTarget, readTarget } from './ask-target';
import styles from './AskAim.module.css';

/**
 * Mode viseur de Demander : le bloc balisé sous le pointeur est entouré, un clic l'ajoute en pastille.
 * Les clics sont pris en phase de capture et n'atteignent jamais la page (ni fiche ni lien) ; seules les zones
 * marquées `data-ask-ui` (panneau, navigation) restent utilisables.
 */
export function AskAim() {
  const { addRef, refs, setAiming } = useAsk();
  const [hovered, setHovered] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-ask-aiming', '');
    const passes = (e: Event) => e.target instanceof Element && Boolean(e.target.closest(`[${ASK_UI}]`));
    const onMove = (e: PointerEvent) => setHovered(findTarget(e.target));
    const block = (e: Event) => {
      if (passes(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onClick = (e: MouseEvent) => {
      if (passes(e)) return;
      block(e);
      const target = findTarget(e.target);
      if (target) addRef(readTarget(target));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Avant le panneau, qui se fermerait sur la même touche : Échap range seulement le viseur.
      e.stopPropagation();
      setAiming(false);
    };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerdown', block, true);
    document.addEventListener('mousedown', block, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      root.removeAttribute('data-ask-aiming');
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerdown', block, true);
      document.removeEventListener('mousedown', block, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [addRef, setAiming]);

  return (
    <>
      {hovered ? <AskOutline el={hovered} /> : null}
      <div className={styles.bar} {...askUi}>
        <Crosshair aria-hidden />
        <span className={styles.barText}>
          {refs.length > 0 ? `${refs.length} bloc${refs.length > 1 ? 's' : ''} montré${refs.length > 1 ? 's' : ''}` : 'Touche un bloc à montrer'}
        </span>
        <Button size="sm" variant="primary" onClick={() => setAiming(false)}>
          Terminé
        </Button>
      </div>
    </>
  );
}

/** Liseré et étiquette dessinés au-dessus d'un bloc, sans toucher à ses styles ; suit le défilement. */
export function AskOutline({ el }: { el: HTMLElement }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const next = el.getBoundingClientRect();
      setRect((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [el]);

  if (!rect || !el.isConnected) return null;
  const inside = rect.top < 28;
  return (
    <div
      className={styles.outline}
      style={{
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }}
      aria-hidden
    >
      <span className={[styles.tag, inside ? styles.tagInside : ''].join(' ')}>{el.dataset.askLabel}</span>
    </div>
  );
}
