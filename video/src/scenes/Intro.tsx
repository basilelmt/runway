import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandMark, Plane } from '../components/Brand';
import { PerspectiveRunway, Slam } from '../components/Motion';
import { color, font } from '../theme';
import type { ShotDef } from './types';

function Words({ text, background, ink, speed }: { text: string; background: string; ink: string; speed: number }) {
  return (
    <AbsoluteFill style={{ background, alignItems: 'center', justifyContent: 'center' }}>
      {background === color.tarmac ? <PerspectiveRunway speed={speed} opacity={0.55} /> : null}
      <Slam text={text} size={210} color={ink} />
    </AbsoluteFill>
  );
}

/** Le logo se pose sur la piste qui file, un avion passe en rase-mottes. */
function Logo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = spring({ frame, fps, config: { damping: 11, stiffness: 200, mass: 0.6 } });
  const word = spring({ frame: frame - 5, fps, config: { damping: 200 }, durationInFrames: 16 });
  const tag = spring({ frame: frame - 22, fps, config: { damping: 200 }, durationInFrames: 16 });
  const fly = interpolate(frame, [10, 48], [-300, 2200], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => t * t });
  return (
    <AbsoluteFill style={{ background: color.tarmac, alignItems: 'center', justifyContent: 'center' }}>
      <PerspectiveRunway speed={18} opacity={0.7} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 44, marginTop: -160 }}>
        <div style={{ transform: `scale(${mark}) rotate(${(1 - mark) * -30}deg)` }}>
          <BrandMark size={176} outline />
        </div>
        <div style={{ overflow: 'hidden', paddingBottom: 16 }}>
          <div style={{ font: `700 200px/1 ${font.display}`, letterSpacing: '-0.045em', color: color.tarmacInk, transform: `translateY(${(1 - word) * 110}%)` }}>Runway</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 596, opacity: tag, transform: `translateY(${(1 - tag) * 20}px)`, font: `500 30px ${font.mono}`, letterSpacing: '0.14em', color: color.marking }}>
        ENVELOPPES · PRÉVISION · CLAUDE · EN LOCAL
      </div>
      <div style={{ position: 'absolute', left: fly, top: 900 - (fly / 2200) * 200, transform: `rotate(${-(fly / 2200) * 10}deg)`, filter: 'blur(1px)' }}>
        <Plane size={110} />
      </div>
    </AbsoluteFill>
  );
}

export const intro: ShotDef[] = [
  { frames: 24, node: <Words text="Ton argent," background={color.tarmac} ink={color.tarmacInk} speed={30} /> },
  { frames: 20, node: <Words text="jusqu’à la" background={color.tarmac} ink={color.tarmacInk} speed={44} /> },
  { frames: 30, flash: true, node: <Words text="prochaine paie." background={color.marking} ink={color.markingOn} speed={0} /> },
  { frames: 66, entrance: 'punch', node: <Logo /> },
];
