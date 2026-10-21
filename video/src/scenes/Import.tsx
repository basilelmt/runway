import { FeatureShot } from '../components/FeatureShot';
import { TitleCard } from '../components/Motion';
import { Callout, Cursor, FileChip, Highlight } from '../components/Overlays';
import type { ShotDef } from './types';

const LABEL = '05 Import';

export const importShots: ShotDef[] = [
  { frames: 16, flash: true, node: <TitleCard index="05" word="Import" tone="tarmac" /> },
  {
    frames: 40,
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'import-depot.png', at: 0 }]}
        tiltFrom={{ rx: 12, ry: -16 }}
        tiltTo={{ rx: 3, ry: -4 }}
        camera={[
          { at: 0, x: 0.55, y: 0.42, zoom: 1.15 },
          { at: 40, x: 0.58, y: 0.45, zoom: 1.25 },
        ]}
      >
        <Cursor
          from={0}
          carry={<FileChip name="releve-octobre.csv" />}
          dropAt={30}
          stops={[
            { at: 0, x: 0.72, y: 0.14 },
            { at: 26, x: 0.6, y: 0.47 },
            { at: 30, x: 0.6, y: 0.47, click: true },
          ]}
        />
      </FeatureShot>
    ),
  },
  {
    frames: 38,
    entrance: 'punch',
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'import-apercu.png', at: 0 }]}
        camera={[
          { at: 0, x: 0.42, y: 0.42, zoom: 1.6 },
          { at: 38, x: 0.42, y: 0.42, zoom: 1.7 },
        ]}
        floating={
          <Callout x={0.47} y={0.32} from={10}>
            Netflix rapproché, un doublon écarté.
          </Callout>
        }
      >
        <Highlight box={{ x0: 0.232, y0: 0.326, x1: 0.452, y1: 0.386 }} from={4} />
      </FeatureShot>
    ),
  },
  {
    frames: 54,
    entrance: 'whip',
    node: (
      <FeatureShot
        label={LABEL}
        shots={[{ src: 'tri-claude.png', at: 0 }]}
        camera={[
          { at: 0, x: 0.62, y: 0.6, zoom: 1.3 },
          { at: 54, x: 0.64, y: 0.62, zoom: 1.4 },
        ]}
        floating={
          <Callout x={0.4} y={0.895} from={14}>
            Claude trie le reste, chaque choix s’explique et devient une règle.
          </Callout>
        }
      >
        <Highlight box={{ x0: 0.832, y0: 0.556, x1: 0.944, y1: 0.874 }} from={8} label="Proposé par Claude" />
      </FeatureShot>
    ),
  },
];
