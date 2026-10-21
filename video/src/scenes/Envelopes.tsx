import { FeatureShot } from '../components/FeatureShot';
import { Counter, TitleCard } from '../components/Motion';
import { Callout, Highlight } from '../components/Overlays';
import type { ShotDef } from './types';

const LABEL = '01 Enveloppes';

export const envelopes: ShotDef[] = [
  { frames: 16, flash: true, node: <TitleCard index="01" word="Enveloppes" /> },
  {
    frames: 52,
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'budget.png', at: 0 }]}
        tiltFrom={{ rx: 20, ry: -24, rz: 3 }}
        tiltTo={{ rx: 3, ry: -5 }}
        camera={[
          { at: 0, x: 0.5, y: 0.5, zoom: 1 },
          { at: 12, x: 0.5, y: 0.5, zoom: 1 },
          { at: 26, x: 0.34, y: 0.26, zoom: 1.85 },
          { at: 52, x: 0.35, y: 0.26, zoom: 1.95 },
        ]}
        floating={
          <Callout x={0.42} y={0.31} from={28}>
            <Counter to={666.77} delay={28} duration={18} /> à glisser dans une enveloppe.
          </Callout>
        }
      >
        <Highlight box={{ x0: 0.215, y0: 0.172, x1: 0.4, y1: 0.292 }} from={26} />
      </FeatureShot>
    ),
  },
  {
    frames: 54,
    entrance: 'whip',
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'budget.png', at: 0 }]}
        tiltFrom={{ rx: 0, ry: 10 }}
        tiltTo={{ rx: 2, ry: 3 }}
        tiltFrames={30}
        camera={[
          { at: 0, x: 0.58, y: 0.64, zoom: 1.32 },
          { at: 54, x: 0.58, y: 0.62, zoom: 1.4 },
        ]}
        floating={
          <Callout x={0.45} y={0.4} from={12}>
            Le loyer, une charge fixe, fait le budget de Logement : 890 €.
          </Callout>
        }
      >
        <Highlight box={{ x0: 0.215, y0: 0.503, x1: 0.945, y1: 0.565 }} from={6} />
      </FeatureShot>
    ),
  },
];
