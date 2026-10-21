import { FeatureShot } from '../components/FeatureShot';
import { TitleCard } from '../components/Motion';
import { Callout, Cursor, Highlight } from '../components/Overlays';
import type { ShotDef } from './types';

const LABEL = '02 Demander';

export const ask: ShotDef[] = [
  { frames: 16, flash: true, node: <TitleCard index="02" word="Demander" tone="tarmac" /> },
  {
    frames: 46,
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'demander-viseur.png', at: 0 }]}
        tiltFrom={{ rx: 12, ry: 16 }}
        tiltTo={{ rx: 2, ry: 4 }}
        camera={[
          { at: 0, x: 0.42, y: 0.64, zoom: 1.25 },
          { at: 46, x: 0.4, y: 0.7, zoom: 1.42 },
        ]}
      >
        <Cursor
          from={0}
          stops={[
            { at: 0, x: 0.6, y: 0.45 },
            { at: 22, x: 0.33, y: 0.71 },
            { at: 27, x: 0.33, y: 0.71, click: true },
          ]}
        />
      </FeatureShot>
    ),
  },
  {
    frames: 32,
    entrance: 'punch',
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'demander-question.png', at: 0 }]}
        camera={[
          { at: 0, x: 0.86, y: 0.88, zoom: 2 },
          { at: 32, x: 0.86, y: 0.88, zoom: 2.15 },
        ]}
      />
    ),
  },
  {
    frames: 58,
    entrance: 'whip',
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'demander-reponse.png', at: 0 }]}
        camera={[
          { at: 0, x: 0.86, y: 0.36, zoom: 1.75 },
          { at: 58, x: 0.86, y: 0.36, zoom: 1.88 },
        ]}
        floating={
          <Callout x={0.445} y={0.5} from={8}>
            Claude retrouve l’achat qui a fait déborder Logement, et propose de le couvrir.
          </Callout>
        }
      >
        <Cursor
          from={16}
          stops={[
            { at: 16, x: 0.8, y: 0.62 },
            { at: 38, x: 0.944, y: 0.486 },
            { at: 43, x: 0.944, y: 0.486, click: true },
          ]}
        />
      </FeatureShot>
    ),
  },
  {
    frames: 38,
    flash: true,
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'demander-applique.png', at: 0 }]}
        tiltFrom={{ rx: -10, ry: -12 }}
        tiltTo={{ rx: 0, ry: -2 }}
        camera={[
          { at: 0, x: 0.5, y: 0.5, zoom: 1 },
          { at: 38, x: 0.45, y: 0.45, zoom: 1.15 },
        ]}
      >
        <Highlight box={{ x0: 0.189, y0: 0.432, x1: 0.437, y1: 0.464 }} from={8} label="Mis à jour aussitôt" />
      </FeatureShot>
    ),
  },
];
