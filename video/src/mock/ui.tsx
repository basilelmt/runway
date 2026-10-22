import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { WordsSlam } from '../components/Motion';
import { color, font, outEase } from '../theme';

/** Imitations de l'interface de Runway, dessinées pour la vidéo : mêmes couleurs et polices, texte agrandi pour l'écran. */

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Montant au format français, avec espaces insécables. */
export function eur(value: number, signed = false): string {
  const text = Math.abs(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u202f/g, '\u00a0');
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  return `${sign}${text}\u00a0€`;
}

/** Couleurs des enveloppes de la démonstration. */
export const ENV = {
  logement: { name: 'Logement', color: '#5b7c99' },
  courses: { name: 'Courses', color: '#4f8a5b' },
  transports: { name: 'Transports', color: '#b8731a' },
  sorties: { name: 'Sorties', color: '#7b5ea7' },
  abonnements: { name: 'Abonnements', color: '#a8556f' },
  sante: { name: 'Santé', color: '#2f7d7a' },
  shopping: { name: 'Shopping', color: '#8a6d3b' },
  vacances: { name: 'Vacances', color: '#3f8fb0' },
  epargne: { name: 'Épargne', color: color.marking },
} as const;
export type EnvKey = keyof typeof ENV;

/** Carte de l'app : papier relevé, liseré fin, ombre douce. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        background: color.paperRaised,
        borderRadius: 22,
        boxShadow: '0 40px 90px rgb(20 32 28 / 0.18), 0 8px 20px rgb(20 32 28 / 0.08), 0 0 0 1.5px rgb(20 32 28 / 0.07)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Pastille d'enveloppe (comme InlinePill) : vide en pointillés, ou proposée par Claude en jaune. */
export function EnvelopePill({ env, tone = 'filled', scale = 1 }: { env: EnvKey | null; tone?: 'filled' | 'suggested'; scale?: number }) {
  const empty = env === null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 18px',
        borderRadius: 999,
        font: `500 26px ${font.body}`,
        color: empty ? color.inkMute : color.ink,
        background: empty ? 'transparent' : tone === 'suggested' ? color.markingSoft : color.paper,
        border: empty ? `2px dashed ${color.rule}` : tone === 'suggested' ? `2px solid ${color.marking}` : `2px solid ${color.rule}`,
        transform: `scale(${scale})`,
        whiteSpace: 'nowrap',
      }}
    >
      {empty ? 'À ranger' : (
        <>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: ENV[env].color }} />
          {ENV[env].name}
        </>
      )}
    </span>
  );
}

/** Étincelle de Claude (icône Sparkles de lucide, licence ISC). */
export function Sparkle({ size = 28, tint = color.markingOn }: { size?: number; tint?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </svg>
  );
}

/** Pointeur de souris, toujours au premier plan, avec une onde jaune au clic. */
export function Pointer({ x, y, clickAt, opacity = 1 }: { x: number; y: number; clickAt?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  const t = clickAt === undefined ? -1 : (frame - clickAt) / 16;
  const press = clickAt !== undefined && frame >= clickAt && frame < clickAt + 5 ? 0.85 : 1;
  return (
    <>
      {t >= 0 && t < 1 ? (
        <div style={{ position: 'absolute', zIndex: 10, left: x - (16 + t * 44), top: y - (16 + t * 44), width: (16 + t * 44) * 2, height: (16 + t * 44) * 2, borderRadius: '50%', border: `4px solid ${color.marking}`, opacity: (1 - t) * opacity }} />
      ) : null}
      <svg width="40" height="47" viewBox="0 0 17 20" style={{ position: 'absolute', zIndex: 10, left: x - 3, top: y - 2, opacity, transform: `scale(${press})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 4px 8px rgb(20 32 28 / 0.35))' }}>
        <path d="M1.5 1.5v15.2l4.1-3.9 2.7 6.1 2.6-1.1-2.7-6h5.6z" fill={color.ink} stroke={color.paper} strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </>
  );
}

/** Position animée entre des étapes `[image, x, y]`. */
export function path(frame: number, stops: [number, number, number][]): { x: number; y: number } {
  if (frame <= stops[0]![0]) return { x: stops[0]![1], y: stops[0]![2] };
  for (let i = 1; i < stops.length; i++) {
    const [fa, xa, ya] = stops[i - 1]!;
    const [fb, xb, yb] = stops[i]!;
    if (frame <= fb) {
      const t = interpolate(frame, [fa, fb], [0, 1], { ...clamp, easing: outEase });
      return { x: xa + (xb - xa) * t, y: ya + (yb - ya) * t };
    }
  }
  const last = stops.at(-1)!;
  return { x: last[1], y: last[2] };
}

/** Apparition en ressort à `delay` : renvoie la progression (0 à 1, avec dépassement). */
export function usePop(delay: number, stiffness = 220): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness, mass: 0.6 } });
}

/** Légende d'un plan : numéro de partie et phrase qui claque, en haut à gauche. */
export function Caption({ index, text, night = false, top = 64, left = 96, size = 76 }: { index: string; text: string; night?: boolean; top?: number; left?: number; size?: number }) {
  const pop = usePop(0);
  return (
    <div style={{ position: 'absolute', left, top, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ opacity: Math.min(1, pop), transform: `translateX(${(1 - Math.min(1, pop)) * -30}px)` }}>
        <span style={{ padding: '6px 14px', borderRadius: 8, background: color.marking, color: color.markingOn, font: `500 24px ${font.mono}`, letterSpacing: '0.1em' }}>{index}</span>
      </div>
      <WordsSlam text={text} size={size} color={night ? color.nightInk : color.ink} delay={3} />
    </div>
  );
}

/** Fond papier d'un plan d'interface, avec une grille de registre très discrète. */
export function Paper({ children, night = false }: { children: ReactNode; night?: boolean }) {
  return (
    <AbsoluteFill
      style={{
        background: night ? color.night : color.paper,
        backgroundImage: night ? undefined : `linear-gradient(${color.paperSunken} 1.5px, transparent 1.5px)`,
        backgroundSize: '100% 64px',
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
