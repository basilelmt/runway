import { Sequence, Series } from 'remotion';
import { Flash, Shot } from './components/Motion';
import { ask } from './scenes/Ask';
import { envelopes } from './scenes/Envelopes';
import { forecast } from './scenes/Forecast';
import { importShots } from './scenes/Import';
import { intro } from './scenes/Intro';
import { invest } from './scenes/Invest';
import { outro } from './scenes/Outro';
import type { ShotDef } from './scenes/types';

const SHOTS: ShotDef[] = [...intro, ...envelopes, ...ask, ...forecast, ...invest, ...importShots, ...outro];

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

/** La vidéo de présentation : une trentaine de plans courts, coupés sec. */
export function Presentation() {
  return <Montage shots={SHOTS} />;
}

/** Boucle courte du GIF du README : le logo, puis Budget, Demander et la prévision. */
const TEASER: ShotDef[] = [intro[3]!, envelopes[1]!, ask[3]!, forecast[1]!].map((s) => ({ ...s, frames: Math.min(s.frames, 48) }));
export const TEASER_FRAMES = TEASER.reduce((sum, s) => sum + s.frames, 0);

export function Teaser() {
  return <Montage shots={TEASER} />;
}
