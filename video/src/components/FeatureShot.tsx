import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { color, font, outEase } from '../theme';
import { Screen, type CameraKey, type Shot as ScreenShot } from './Screen';

export const SHOT_W = 1520;
export const SHOT_H = 950;

type Tilt = { rx: number; ry: number; rz?: number };

type FeatureShotProps = {
  label: string;
  shots: ScreenShot[];
  camera: CameraKey[];
  /** Inclinaison 3D de départ ; le cadre se redresse vers `tiltTo` (à plat par défaut) en `tiltFrames` images. */
  tiltFrom?: Tilt;
  tiltTo?: Tilt;
  tiltFrames?: number;
  night?: boolean;
  children?: ReactNode;
  floating?: ReactNode;
};

/** Plan de fonctionnalité : la capture presque plein cadre, inclinée en 3D, avec l'étiquette de la partie. */
export function FeatureShot({ label, shots, camera, tiltFrom = { rx: 0, ry: 0 }, tiltTo = { rx: 0, ry: 0 }, tiltFrames = 14, night = false, children, floating }: FeatureShotProps) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, tiltFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: outEase });
  const rx = tiltFrom.rx + (tiltTo.rx - tiltFrom.rx) * t;
  const ry = tiltFrom.ry + (tiltTo.ry - tiltFrom.ry) * t;
  const rz = (tiltFrom.rz ?? 0) + ((tiltTo.rz ?? 0) - (tiltFrom.rz ?? 0)) * t;
  return (
    <AbsoluteFill style={{ background: night ? color.night : color.paper, perspective: 2600 }}>
      <div style={{ position: 'absolute', left: (1920 - SHOT_W) / 2, top: (1080 - SHOT_H) / 2, transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`, transformStyle: 'preserve-3d' }}>
        <Screen width={SHOT_W} height={SHOT_H} enterAt={-60} dark={night} shots={shots} camera={camera} floating={floating}>
          {children}
        </Screen>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 72,
          bottom: 40,
          padding: '10px 18px',
          borderRadius: 10,
          background: color.marking,
          color: color.markingOn,
          font: `500 26px ${font.mono}`,
          letterSpacing: '0.1em',
          boxShadow: '0 10px 30px rgb(20 32 28 / 0.25)',
        }}
      >
        {label.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
}
