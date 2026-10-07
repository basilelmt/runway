import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import { pixelize, PixelText } from './PixelText';
import styles from './MoonTrail.module.css';

const PIXEL = 2;
const GAP = 3;
/** Ressort qui tire la fusée vers sa cible : raideur faible et amortissement fort pour un vol souple, sans à-coups. */
const STIFFNESS = 0.012;
const DAMPING = 0.86;
/** Vol libre quand la souris est partie : une boucle lente (en millisecondes par radian) dans le ciel du bloc. */
const WANDER_X_MS = 4200;
const WANDER_Y_MS = 2900;
/** Chaque lettre rattrape sa voisine un peu plus mollement, d'où la traînée qui ondule. */
const LINK_EASE = 0.28;
const ROCKET_SIZE = 14;

/** Fusée pointée vers le haut ; « o » est le hublot. */
const ROCKET = ['...#...', '..###..', '..#o#..', '..###..', '..###..', '.#####.', '##.#.##'];
/** Deux images de flamme, alternées en CSS. */
const FLAMES = [['..#.#..', '...#...'], ['...#...', '..#.#..']];

/** Lettres de la traînée, de la plus proche de la fusée à la plus lointaine : lue de gauche à droite quand la fusée file vers la droite. */
const LETTERS = [...'TO THE MOON'].reverse();

type Node = { x: number; y: number };

function Rocket() {
  const cells = (rows: string[], dy: number, char: string) =>
    rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === char ? [{ x, y: y + dy }] : [])));
  return (
    <svg viewBox="0 0 7 9" width={ROCKET_SIZE} height={(ROCKET_SIZE * 9) / 7} shapeRendering="crispEdges" className={styles.rocketSvg} aria-hidden>
      {cells(ROCKET, 0, '#').map((p) => (
        <rect key={`b${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} className={styles.body} />
      ))}
      {cells(ROCKET, 0, 'o').map((p) => (
        <rect key={`w${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} className={styles.window} />
      ))}
      {FLAMES.map((frame, i) => (
        <g key={i} className={i === 0 ? styles.flameA : styles.flameB}>
          {cells(frame, 7, '#').map((p) => (
            <rect key={`f${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} />
          ))}
        </g>
      ))}
    </svg>
  );
}

/**
 * Au survol du parent, une fusée en pixels suit le curseur au bout d'un ressort, tirant « TO THE MOON » derrière elle
 * comme une corde : chaque lettre suit la précédente à distance fixe. Quand la souris s'en va, la fusée continue
 * de voler seule dans le ciel du bloc. Souris uniquement ; l'animation s'arrête quand le bloc sort de l'écran.
 */
export function MoonTrail() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const parts = [...el.children] as HTMLElement[];
    const rocket = parts[0]!;
    const letters = parts.slice(1);
    const spacing = [ROCKET_SIZE / 2 + GAP, ...LETTERS.map((ch) => pixelize(ch).width * PIXEL + GAP)];
    const reduced = prefersReducedMotion();

    const target: Node = { x: 0, y: 0 };
    const nodes: Node[] = parts.map(() => ({ x: 0, y: 0 }));
    const velocity: Node = { x: 0, y: 0 };
    let angle = 0;
    let frame = 0;
    let running = false;
    let started = false;
    let hovering = false;
    let visible = true;

    const place = () => {
      // Au premier survol, la traînée part à l'horizontale à gauche du curseur.
      nodes.forEach((n, i) => {
        n.x = target.x - spacing.slice(0, i).reduce((a, b) => a + b, 0);
        n.y = target.y;
      });
    };

    const tick = (t: number) => {
      const head = nodes[0]!;
      if (!hovering) {
        // Vol libre : la cible décrit une boucle lente dans le haut du bloc, la fusée la suit au ressort.
        target.x = host.clientWidth * (0.55 + 0.32 * Math.sin(t / WANDER_X_MS));
        target.y = host.clientHeight * (0.38 + 0.2 * Math.sin(t / WANDER_Y_MS + 1));
      }
      if (reduced) {
        head.x = target.x;
        head.y = target.y;
      } else {
        velocity.x = (velocity.x + (target.x - head.x) * STIFFNESS) * DAMPING;
        velocity.y = (velocity.y + (target.y - head.y) * STIFFNESS) * DAMPING;
        head.x += velocity.x;
        head.y += velocity.y;
      }
      const vx = velocity.x;
      const vy = velocity.y;
      // La fusée pointe où elle va ; à l'arrêt, elle garde son cap.
      if (Math.hypot(vx, vy) > 0.4) angle = Math.atan2(vy, vx) + Math.PI / 2;
      rocket.style.transform = `translate3d(${head.x}px, ${head.y}px, 0) translate(-50%, -50%) rotate(${angle}rad)`;

      for (let i = 1; i < nodes.length; i++) {
        const prev = nodes[i - 1]!;
        const n = nodes[i]!;
        const dx = n.x - prev.x;
        const dy = n.y - prev.y;
        const d = Math.hypot(dx, dy) || 1;
        const gap = spacing[i - 1]! / 2 + spacing[i]! / 2;
        const k = reduced ? 1 : LINK_EASE;
        n.x += (prev.x + (dx / d) * gap - n.x) * k;
        n.y += (prev.y + (dy / d) * gap - n.y) * k;
        const wave = reduced ? 0 : Math.sin(t / 260 + i * 0.7) * 1.5;
        letters[i - 1]!.style.transform = `translate3d(${n.x}px, ${n.y + wave}px, 0) translate(-50%, -50%)`;
      }
      if (running) frame = requestAnimationFrame(tick);
    };

    const local = (e: PointerEvent) => {
      const box = host.getBoundingClientRect();
      target.x = e.clientX - box.left + 18;
      target.y = e.clientY - box.top - 14;
    };
    const start = () => {
      if (running || !visible) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const enter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      hovering = true;
      local(e);
      // Au tout premier survol, la traînée apparaît à côté du curseur ; ensuite la fusée revient d'où elle volait.
      if (!started) place();
      started = true;
      el.dataset.on = '';
      start();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (!hovering) enter(e);
      else local(e);
    };
    const leave = () => {
      hovering = false;
      // Sans animation, pas de vol libre : la traînée disparaît avec la souris.
      if (reduced) {
        delete el.dataset.on;
        stop();
      }
    };

    // Hors de l'écran, inutile de faire tourner l'animation.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (!visible) stop();
      else if (started) start();
    });
    observer.observe(host);

    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    return () => {
      stop();
      observer.disconnect();
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div ref={root} className={styles.trail} aria-hidden>
      <span className={styles.rocket}>
        <Rocket />
      </span>
      {LETTERS.map((ch, i) => (
        <span key={i} className={styles.letter}>
          <PixelText text={ch} pixel={PIXEL} />
        </span>
      ))}
    </div>
  );
}
