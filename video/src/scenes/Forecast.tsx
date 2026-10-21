import { FeatureShot } from '../components/FeatureShot';
import { TitleCard } from '../components/Motion';
import { Callout, Highlight } from '../components/Overlays';
import type { ShotDef } from './types';

const LABEL = '03 Prévision';

export const forecast: ShotDef[] = [
  { frames: 16, flash: true, node: <TitleCard index="03" word="Prévision" /> },
  {
    frames: 50,
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'prevision.png', at: 0 }]}
        tiltFrom={{ rx: 26, ry: 0 }}
        tiltTo={{ rx: 5, ry: 0 }}
        camera={[
          { at: 0, x: 0.58, y: 0.42, zoom: 1.32 },
          { at: 50, x: 0.6, y: 0.42, zoom: 1.42 },
        ]}
      >
        <Highlight box={{ x0: 0.218, y0: 0.354, x1: 0.47, y1: 0.386 }} from={10} />
        <Highlight box={{ x0: 0.218, y0: 0.393, x1: 0.943, y1: 0.457 }} from={16} pad={4} />
      </FeatureShot>
    ),
  },
  {
    frames: 50,
    entrance: 'whip',
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'prevision-solde.png', at: 0 }]}
        camera={[
          { at: 0, x: 0.58, y: 0.32, zoom: 1.25 },
          { at: 50, x: 0.56, y: 0.3, zoom: 1.38 },
        ]}
        floating={
          <Callout x={0.38} y={0.29} from={14}>
            412 € d’un coup : Transports passe dans le rouge.
          </Callout>
        }
      >
        <Highlight box={{ x0: 0.218, y0: 0.462, x1: 0.943, y1: 0.524 }} from={8} label="Assurance auto, le 26" />
      </FeatureShot>
    ),
  },
];
