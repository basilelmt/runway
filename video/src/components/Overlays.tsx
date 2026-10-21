import type { ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { camEase, color, font } from '../theme';
import { useScreen } from './Screen';

/** Rectangle de capture, en fractions. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Visibilité d'une incrustation : entrée en ressort à `from`, sortie en fondu à `to`. */
function useLife(from: number, to?: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - from, fps, config: { damping: 18, stiffness: 160 } });
  const leave = to === undefined ? 1 : interpolate(frame, [to, to + 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { enter, opacity: Math.min(1, enter) * leave, visible: frame >= from && leave > 0 };
}

/** Le contour jaune du viseur de Demander, posé sur un bloc de la capture, avec son étiquette. */
export function Highlight({ box, from, to, label, pad = 6 }: { box: Box; from: number; to?: number; label?: string; pad?: number }) {
  const { toFrame } = useScreen();
  const { enter, opacity, visible } = useLife(from, to);
  if (!visible) return null;
  const a = toFrame(box.x0, box.y0);
  const b = toFrame(box.x1, box.y1);
  return (
    <div style={{ position: 'absolute', left: a.left - pad, top: a.top - pad, width: b.left - a.left + pad * 2, height: b.top - a.top + pad * 2, opacity }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 12,
          border: `3px solid ${color.marking}`,
          background: 'rgb(232 185 49 / 0.08)',
          boxShadow: '0 0 0 6px rgb(232 185 49 / 0.18)',
          transform: `scale(${1.04 - 0.04 * Math.min(1, enter)})`,
        }}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: '100%',
            marginBottom: 8,
            padding: '5px 12px',
            borderRadius: 8,
            background: color.marking,
            color: color.markingOn,
            font: `600 20px ${font.body}`,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

/** Carte d'explication accrochée à un point de la capture. */
export function Callout({ x, y, from, to, children, align = 'left' }: { x: number; y: number; from: number; to?: number; children: ReactNode; align?: 'left' | 'right' }) {
  const { toFrame } = useScreen();
  const { enter, opacity, visible } = useLife(from, to);
  if (!visible) return null;
  const p = toFrame(x, y);
  return (
    <div
      style={{
        position: 'absolute',
        left: align === 'left' ? p.left : undefined,
        right: align === 'right' ? `calc(100% - ${p.left}px)` : undefined,
        top: p.top,
        opacity,
        transform: `translateY(${(1 - Math.min(1, enter)) * 16}px)`,
        padding: '16px 22px',
        borderRadius: 14,
        background: color.ink,
        color: color.tarmacInk,
        font: `500 24px/1.35 ${font.body}`,
        boxShadow: '0 18px 44px rgb(20 32 28 / 0.28)',
        maxWidth: 520,
      }}
    >
      {children}
    </div>
  );
}

export type CursorStop = { at: number; x: number; y: number; click?: boolean };

/** Pointeur de souris qui va de point en point, et marque ses clics d'une onde jaune. */
export function Cursor({ stops, from, to, carry, dropAt }: { stops: CursorStop[]; from: number; to?: number; carry?: ReactNode; dropAt?: number }) {
  const frame = useCurrentFrame();
  const { toFrame } = useScreen();
  const { opacity, visible } = useLife(from, to);
  if (!visible) return null;

  let x = stops[0]!.x;
  let y = stops[0]!.y;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (frame >= b.at) {
      x = b.x;
      y = b.y;
    } else if (frame > a.at) {
      const t = camEase((frame - a.at) / (b.at - a.at));
      x = a.x + (b.x - a.x) * t;
      y = a.y + (b.y - a.y) * t;
      break;
    }
  }
  const p = toFrame(x, y);
  // Une onde par clic, sur 18 images ; le pointeur s'enfonce légèrement au moment du clic.
  const clicks = stops.filter((s) => s.click && frame >= s.at && frame < s.at + 18);
  const press = stops.some((s) => s.click && frame >= s.at && frame < s.at + 5) ? 0.86 : 1;

  return (
    <>
      {clicks.map((c) => {
        const t = (frame - c.at) / 18;
        const r = 14 + t * 46;
        return (
          <div
            key={c.at}
            style={{
              position: 'absolute',
              left: p.left - r,
              top: p.top - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: `3px solid ${color.marking}`,
              opacity: (1 - t) * opacity,
            }}
          />
        );
      })}
      {carry && (dropAt === undefined || frame < dropAt + 6) ? (
        <div
          style={{
            position: 'absolute',
            left: p.left + 22,
            top: p.top + 26,
            opacity: opacity * (dropAt === undefined ? 1 : interpolate(frame, [dropAt, dropAt + 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })),
            transform: `scale(${dropAt !== undefined && frame >= dropAt ? 0.9 : 1})`,
          }}
        >
          {carry}
        </div>
      ) : null}
      <svg
        width="34"
        height="40"
        viewBox="0 0 17 20"
        style={{ position: 'absolute', left: p.left - 3, top: p.top - 2, opacity, transform: `scale(${press})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 4px 8px rgb(20 32 28 / 0.35))' }}
      >
        <path d="M1.5 1.5v15.2l4.1-3.9 2.7 6.1 2.6-1.1-2.7-6h5.6z" fill={color.ink} stroke={color.paper} strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </>
  );
}

/** Fichier tenu par le pointeur pendant un glisser-déposer. */
export function FileChip({ name }: { name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        borderRadius: 12,
        background: color.paperRaised,
        boxShadow: '0 14px 34px rgb(20 32 28 / 0.25), 0 0 0 1px rgb(20 32 28 / 0.08)',
        font: `500 22px ${font.mono}`,
        color: color.ink,
        whiteSpace: 'nowrap',
        transform: 'rotate(-3deg)',
      }}
    >
      <span style={{ padding: '3px 8px', borderRadius: 6, background: color.positive, color: color.paper, font: `600 16px ${font.body}` }}>CSV</span>
      {name}
    </div>
  );
}
