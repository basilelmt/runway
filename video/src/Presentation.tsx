import { Sequence, Series } from 'remotion';
import { Flash, Shot } from './components/Motion';
import { envelopes } from './scenes/Envelopes';
import { askShots, forecastShots, investShots } from './scenes/Features';
import { intro } from './scenes/Intro';
import { outro } from './scenes/Outro';
import { sorting } from './scenes/Sorting';
import type { ShotDef } from './scenes/types';

const SHOTS: ShotDef[] = [...intro, ...envelopes, ...sorting, ...askShots, ...forecastShots, ...investShots, ...outro];

export const PRESENTATION_FRAMES = SHOTS.reduce((sum, s) => sum + s.frames, 0);

/** Enchaîne des plans en coupes sèches. */
export function Montage({ shots }: { shots: ShotDef[] }) {
  return (
    <Series>
      {shots.map((shot, i) => (
        <Series.Sequence key={i} durationInFrames={shot.frames}>
          <Shot entrance={shot.entrance}>{shot.node}</Shot>
          {shot.flash ? (
            <Sequence durationInFrames={4}>
              <Flash />
            </Sequence>
          ) : null}
        </Series.Sequence>
      ))}
    </Series>
  );
}

/** La vidéo de présentation : des plans courts, coupés sec, sur des imitations animées de l'interface. */
export function Presentation() {
  return <Montage shots={SHOTS} />;
}

/** Boucle courte du GIF du README : le logo, le salaire réparti, puis le tri par Claude. */
const TEASER: ShotDef[] = [
  { ...intro[3]!, frames: 50 },
  { ...envelopes[1]!, frames: 84 },
  { ...sorting[2]!, frames: 120 },
];
export const TEASER_FRAMES = TEASER.reduce((sum, s) => sum + s.frames, 0);

export function Teaser() {
  return <Montage shots={TEASER} />;
}
