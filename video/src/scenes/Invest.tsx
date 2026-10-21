import { FeatureShot } from '../components/FeatureShot';
import { Counter, TitleCard } from '../components/Motion';
import { Callout, Highlight } from '../components/Overlays';
import type { ShotDef } from './types';

export const invest: ShotDef[] = [
  { frames: 16, flash: true, node: <TitleCard index="04" word="Investir" tone="night" /> },
  {
    frames: 62,
    entrance: 'punch',
    node: (
      <FeatureShot
        label="04 Investir"
        night
        shots={[{ src: 'investir.png', at: 0 }]}
        tiltFrom={{ rx: 14, ry: 20 }}
        tiltTo={{ rx: 3, ry: 5 }}
        tiltFrames={24}
        camera={[
          { at: 0, x: 0.5, y: 0.5, zoom: 1 },
          { at: 14, x: 0.5, y: 0.5, zoom: 1 },
          { at: 30, x: 0.58, y: 0.34, zoom: 1.4 },
          { at: 62, x: 0.58, y: 0.34, zoom: 1.48 },
        ]}
        floating={
          <Callout x={0.25} y={0.53} from={32}>
            Trade Republic et Binance : <Counter to={1602.19} delay={32} duration={20} /> de plus-value.
          </Callout>
        }
      >
        <Highlight box={{ x0: 0.24, y0: 0.448, x1: 0.457, y1: 0.474 }} from={30} />
      </FeatureShot>
    ),
  },
];
