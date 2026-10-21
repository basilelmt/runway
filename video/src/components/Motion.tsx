import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { color, font, outEase } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export type Entrance = 'cut' | 'whip' | 'punch' | 'drop';

/**
 * Entrée d'un plan : coupe sèche, « whip » (glissé rapide et flou de mouvement), « punch » (zoom qui claque)
 * ou « drop » (le plan tombe d'en haut).
 */
export function Shot({ entrance = 'cut', children, background }: { entrance?: Entrance; children: ReactNode; background?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let style: CSSProperties = {};
  if (entrance === 'whip') {
    const t = interpolate(frame, [0, 8], [1, 0], { ...clamp, easing: outEase });
    style = { transform: `translateX(${t * 640}px) skewX(${t * -8}deg)`, filter: `blur(${t * 24}px)` };
  } else if (entrance === 'punch') {
    const s = spring({ frame, fps, config: { damping: 13, stiffness: 220, mass: 0.6 } });
    style = { transform: `scale(${1.35 - 0.35 * s})`, filter: `blur(${Math.max(0, 1 - s * 1.4) * 14}px)` };
  } else if (entrance === 'drop') {
    const s = spring({ frame, fps, config: { damping: 15, stiffness: 180 } });
    style = { transform: `translateY(${(1 - s) * -1100}px)` };
  }
  return (
    <AbsoluteFill style={{ background, overflow: 'hidden' }}>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Éclair jaune de quelques images sur une coupe. */
export function Flash({ frames = 3, tint = color.marking }: { frames?: number; tint?: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, frames], [0.95, 0], clamp);
  return <AbsoluteFill style={{ background: tint, opacity, pointerEvents: 'none' }} />;
}

/** Mot géant qui claque à l'écran : il arrive grand et flou, puis se pose. */
export function Slam({ text, size = 230, color: ink = color.tarmacInk, delay = 0, style }: { text: string; size?: number; color?: string; delay?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 260, mass: 0.5 } });
  return (
    <div
      style={{
        font: `700 ${size}px/0.92 ${font.display}`,
        letterSpacing: '-0.045em',
        color: ink,
        whiteSpace: 'pre',
        textAlign: 'center',
        opacity: Math.min(1, s * 2),
        transform: `scale(${1.6 - 0.6 * s})`,
        filter: `blur(${Math.max(0, 1 - s) * 18}px)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

/** Bandes de marquage qui filent derrière un carton, pour donner de la vitesse. */
export function SpeedStripes({ tint, opacity = 1, speed = 60 }: { tint: string; opacity?: number; speed?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity }}>
      {[180, 540, 900].map((y, i) => (
        <div
          key={y}
          style={{
            position: 'absolute',
            left: -400,
            right: -400,
            top: y,
            height: 14,
            backgroundImage: `repeating-linear-gradient(90deg, ${tint} 0 160px, transparent 160px 260px)`,
            backgroundPositionX: -(frame * speed * (1 + i * 0.25)),
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

/** Carton de fonctionnalité : numéro et nom en plein écran, sur bandes qui filent. */
export function TitleCard({ index, word, tone = 'marking' }: { index: string; word: string; tone?: 'marking' | 'tarmac' | 'night' }) {
  const frame = useCurrentFrame();
  const bg = tone === 'marking' ? color.marking : tone === 'night' ? color.night : color.tarmac;
  const ink = tone === 'marking' ? color.markingOn : color.tarmacInk;
  const accent = tone === 'marking' ? color.tarmac : color.marking;
  const num = interpolate(frame, [0, 8], [80, 0], { ...clamp, easing: outEase });
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      <SpeedStripes tint={accent} opacity={0.14} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        <div style={{ font: `500 120px ${font.mono}`, color: accent, transform: `translateX(${-num}px)`, opacity: interpolate(frame, [0, 5], [0, 1], clamp) }}>{index}</div>
        <Slam text={word} size={210} color={ink} delay={2} />
      </div>
    </AbsoluteFill>
  );
}

/** Piste vue depuis le cockpit : la ligne médiane et les bords filent vers la caméra. */
export function PerspectiveRunway({ speed = 26, opacity = 1 }: { speed?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ perspective: 900, perspectiveOrigin: '50% 66%', opacity, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -200,
          width: 1100,
          height: 3200,
          marginLeft: -550,
          transform: 'rotateX(78deg)',
          transformOrigin: '50% 100%',
          background: 'linear-gradient(to top, #1b2925, #14201c 70%)',
          boxShadow: `inset 22px 0 0 ${color.tarmacInk}, inset -22px 0 0 ${color.tarmacInk}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 26,
            marginLeft: -13,
            backgroundImage: `repeating-linear-gradient(0deg, ${color.marking} 0 180px, transparent 180px 320px)`,
            backgroundPositionY: frame * speed,
          }}
        />
      </div>
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${color.tarmac} 60%, transparent 78%)` }} />
    </AbsoluteFill>
  );
}

/** Montant qui défile jusqu'à sa valeur, au format français. */
export function Counter({ to, from = 0, duration = 24, delay = 0, decimals = 2, suffix = ' €', style }: { to: number; from?: number; duration?: number; delay?: number; decimals?: number; suffix?: string; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [delay, delay + duration], [from, to], { ...clamp, easing: outEase });
  const text = v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/\u202f/g, '\u00a0');
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{`${text}${suffix}`}</span>;
}
