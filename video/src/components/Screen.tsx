import { createContext, useContext, type ReactNode } from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { camEase, color } from '../theme';

/** Une capture de l'app, affichée à partir de l'image `at` (fondu sur 10 images). */
export type Shot = { src: string; at: number };

/** Position de caméra : point visé de la capture, en fraction (0 à 1), et zoom. */
export type CameraKey = { at: number; x: number; y: number; zoom: number };

type Point = { left: number; top: number };

type ScreenGeometry = {
  /** Point de la capture (fractions) vers pixels du cadre, à l'image courante. */
  toFrame: (x: number, y: number) => Point;
  /** Pixels de cadre pour une fraction de largeur de capture. */
  scale: number;
};

const ScreenContext = createContext<ScreenGeometry | null>(null);

export function useScreen(): ScreenGeometry {
  const ctx = useContext(ScreenContext);
  if (!ctx) throw new Error('useScreen hors de <Screen>');
  return ctx;
}

/** Interpole la caméra entre ses positions clés. */
export function cameraAt(keys: CameraKey[], frame: number): Omit<CameraKey, 'at'> {
  const first = keys[0]!;
  if (frame <= first.at || keys.length === 1) return first;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (frame <= b.at) {
      const t = camEase((frame - a.at) / (b.at - a.at));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom: a.zoom + (b.zoom - a.zoom) * t };
    }
  }
  return keys.at(-1)!;
}

type ScreenProps = {
  shots: Shot[];
  camera: CameraKey[];
  width: number;
  height: number;
  /** Image d'entrée du cadre (montée douce). */
  enterAt?: number;
  /** Fond sombre (Investir) : l'ombre et le liseré s'adaptent. */
  dark?: boolean;
  /** Incrustations rognées par le cadre (contours, pointeur). */
  children?: ReactNode;
  /** Incrustations qui peuvent déborder du cadre (encarts d'explication). */
  floating?: ReactNode;
};

/**
 * Capture cadrée, avec une caméra qui zoome et se déplace sur l'image.
 * Les incrustations sont posées en coordonnées de capture via `useScreen`, sans être agrandies par le zoom.
 */
export function Screen({ shots, camera, width, height, enterAt = 0, dark = false, children, floating }: ScreenProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = cameraAt(camera, frame);

  // L'image recouvre toujours le cadre : la caméra s'arrête aux bords de la capture.
  const w = width * cam.zoom;
  const h = height * cam.zoom;
  const tx = Math.min(0, Math.max(width - w, width / 2 - cam.x * w));
  const ty = Math.min(0, Math.max(height - h, height / 2 - cam.y * h));
  const geometry: ScreenGeometry = { toFrame: (x, y) => ({ left: tx + x * w, top: ty + y * h }), scale: w };

  const enter = spring({ frame: frame - enterAt, fps, config: { damping: 200 }, durationInFrames: 28 });

  return (
    <div style={{ position: 'relative', width, height, opacity: enter, transform: `translateY(${(1 - enter) * 48}px)` }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 18,
          overflow: 'hidden',
          background: color.paper,
          boxShadow: dark
            ? '0 40px 120px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(242 239 232 / 0.12)'
            : '0 32px 80px rgb(20 32 28 / 0.22), 0 6px 18px rgb(20 32 28 / 0.10), 0 0 0 1px rgb(20 32 28 / 0.08)',
        }}
      >
        {shots.map((shot) => {
          const opacity = interpolate(frame, [shot.at, shot.at + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <Img
              key={`${shot.src}-${shot.at}`}
              src={staticFile(shot.src)}
              style={{ position: 'absolute', left: tx, top: ty, width: w, height: h, opacity: shot.at <= 0 ? 1 : opacity }}
            />
          );
        })}
        <ScreenContext.Provider value={geometry}>{children}</ScreenContext.Provider>
      </div>
      <ScreenContext.Provider value={geometry}>{floating}</ScreenContext.Provider>
    </div>
  );
}
