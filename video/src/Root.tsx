import { Composition } from 'remotion';
import { Presentation, PRESENTATION_FRAMES, Teaser, TEASER_FRAMES } from './Presentation';
import { VIDEO } from './theme';

export function Root() {
  return (
    <>
      <Composition id="Presentation" component={Presentation} durationInFrames={PRESENTATION_FRAMES} {...VIDEO} />
      <Composition id="Teaser" component={Teaser} durationInFrames={TEASER_FRAMES} {...VIDEO} />
    </>
  );
}
