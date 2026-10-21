import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandMark, Plane } from '../components/Brand';
import { PerspectiveRunway, Slam } from '../components/Motion';
import { color, font } from '../theme';
import type { ShotDef } from './types';

const WALL = ['budget.png', 'demander-reponse.png', 'prevision.png', 'investir.png', 'import-apercu.png', 'tri-claude.png', 'prevision-solde.png', 'demander-viseur.png', 'tri-claude.png'];

/** Mur de captures incliné qui recule, avant la fin. */
function Wall() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, 56], [1.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: color.tarmac, perspective: 2200, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 3 * 760 + 2 * 40,
          marginLeft: -(3 * 760 + 80) / 2,
          marginTop: -(3 * 475 + 80) / 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 760px)',
          gap: 40,
          transform: `scale(${zoom}) rotateX(24deg) rotateZ(-10deg) translateY(${frame * -3}px)`,
        }}
      >
        {WALL.map((src, i) => {
          const s = spring({ frame: frame - i * 2, fps, config: { damping: 16, stiffness: 200 } });
          return (
            <Img
              key={i}
              src={staticFile(src)}
              style={{ width: 760, height: 475, borderRadius: 14, opacity: s, transform: `translateY(${(1 - s) * 200}px)`, boxShadow: '0 30px 60px rgb(0 0 0 / 0.45)' }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Word({ text, background, ink }: { text: string; background: string; ink: string }) {
  return (
    <AbsoluteFill style={{ background, alignItems: 'center', justifyContent: 'center' }}>
      <Slam text={text} size={240} color={ink} />
    </AbsoluteFill>
  );
}

/** Fin : le logo, la commande pour démarrer, et l'avion qui décolle. */
function End() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
  const cmd = spring({ frame: frame - 12, fps, config: { damping: 200 }, durationInFrames: 16 });
  const fly = interpolate(frame, [16, 70], [-200, 2300], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => t * t });
  const fade = interpolate(frame, [64, 80], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: color.tarmac }}>
      <AbsoluteFill style={{ opacity: fade, alignItems: 'center', justifyContent: 'center' }}>
        <PerspectiveRunway speed={10} opacity={0.6} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: -140, transform: `scale(${0.6 + 0.4 * mark})`, opacity: mark }}>
          <BrandMark size={140} outline />
          <span style={{ font: `700 160px/1 ${font.display}`, letterSpacing: '-0.045em', color: color.tarmacInk }}>Runway</span>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 600,
            opacity: cmd,
            transform: `translateY(${(1 - cmd) * 24}px)`,
            display: 'flex',
            gap: 18,
            padding: '18px 30px',
            borderRadius: 14,
            background: 'rgb(238 242 239 / 0.08)',
            boxShadow: '0 0 0 1px rgb(238 242 239 / 0.18)',
            font: `500 38px ${font.mono}`,
            color: color.tarmacInk,
          }}
        >
          <span style={{ color: color.marking }}>$</span>
          <span>npm install &amp;&amp; npm run dev</span>
        </div>
        <div style={{ position: 'absolute', left: fly, top: 930 - (fly / 2300) * 190, transform: `rotate(${-(fly / 2300) * 10}deg)` }}>
          <Plane size={96} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const outro: ShotDef[] = [
  { frames: 56, entrance: 'punch', node: <Wall /> },
  { frames: 22, flash: true, node: <Word text="En local." background={color.marking} ink={color.markingOn} /> },
  { frames: 22, node: <Word text="Sans compte." background={color.tarmac} ink={color.tarmacInk} /> },
  { frames: 28, node: <Word text="Sans cloud." background={color.tarmac} ink={color.marking} /> },
  { frames: 80, entrance: 'punch', node: <End /> },
];
