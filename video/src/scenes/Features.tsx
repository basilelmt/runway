import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Counter, TitleCard } from '../components/Motion';
import { Card, Caption, clamp, Paper, path, Pointer, Sparkle, usePop } from '../mock/ui';
import { color, font, outEase } from '../theme';
import type { ShotDef } from './types';

const QUESTION = 'Pourquoi Sorties est dans le rouge ?';
const ANSWER = 'Surtout le concert à la Cigale, 82,50 €. Prends 25,30 € sur Vacances.';

/** Demander : la question se tape, la réponse arrive mot à mot, l'action s'applique d'un clic. */
function Ask() {
  const frame = useCurrentFrame();
  const typed = QUESTION.slice(0, Math.floor(interpolate(frame, [6, 32], [0, QUESTION.length], clamp)));
  const sent = frame >= 38;
  const answerWords = ANSWER.split(' ');
  const shown = Math.floor(interpolate(frame, [52, 112], [0, answerWords.length], clamp));
  const figure = usePop(44);
  const action = usePop(116);
  const p = path(frame, [
    [118, 1500, 980],
    [138, 1700, 600],
  ]);
  const applied = frame >= 144;
  return (
    <Paper>
      <Caption index="03 DEMANDER" text={'Demande,\nClaude\ncherche.'} />

      <Card style={{ left: 820, top: 130, width: 980, height: 820, padding: '30px 40px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 12, background: color.marking }}>
            <Sparkle size={28} />
          </span>
          <span style={{ font: `700 36px ${font.display}`, color: color.ink }}>Demander</span>
        </div>

        {sent ? (
          <div style={{ alignSelf: 'flex-end', marginTop: 34, padding: '16px 24px', borderRadius: 18, background: color.paperSunken, font: `500 30px ${font.body}`, color: color.ink }}>{QUESTION}</div>
        ) : null}

        {frame >= 44 ? (
          <div style={{ marginTop: 30, paddingLeft: 26, borderLeft: `4px solid ${color.marking}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, opacity: Math.min(1, figure), transform: `translateY(${(1 - Math.min(1, figure)) * 16}px)` }}>
              <span style={{ font: `700 72px ${font.display}`, letterSpacing: '-0.03em', color: color.negative }}>
                <Counter to={325.3} delay={44} duration={20} />
              </span>
            </div>
            <p style={{ margin: '18px 0 0', font: `400 31px/1.5 ${font.body}`, color: color.ink }}>{answerWords.slice(0, shown).join(' ')}</p>
            <div
              style={{
                marginTop: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '22px 26px',
                borderRadius: 16,
                boxShadow: `0 0 0 2px ${color.rule}`,
                opacity: Math.min(1, action),
                transform: `scale(${0.95 + 0.05 * action})`,
              }}
            >
              <span style={{ font: `500 28px ${font.body}`, color: color.ink }}>Déplacer 25,30 € de Vacances vers Sorties</span>
              {applied ? (
                <span style={{ font: `600 28px ${font.body}`, color: color.positive }}>✓ Fait</span>
              ) : (
                <span style={{ padding: '12px 22px', borderRadius: 10, background: color.ink, color: color.paper, font: `500 26px ${font.body}` }}>Appliquer</span>
              )}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 'auto', padding: '22px 26px', borderRadius: 18, boxShadow: `0 0 0 2px ${sent ? color.rule : color.marking}`, background: color.paperRaised }}>
          <span style={{ padding: '6px 14px', borderRadius: 8, background: color.markingSoft, font: `500 24px ${font.body}`, color: color.markingOn }}>◎ Enveloppe Sorties</span>
          <div style={{ marginTop: 16, minHeight: 40, font: `400 30px ${font.body}`, color: sent ? color.inkMute : color.ink }}>
            {sent ? '' : typed}
            {!sent && frame % 16 < 9 ? <span style={{ color: color.ink }}>|</span> : null}
          </div>
        </div>
      </Card>
      {frame >= 118 ? <Pointer x={p.x} y={p.y} clickAt={140} /> : null}
    </Paper>
  );
}

/** Investir : la carte de nuit du portefeuille, sa valeur qui défile et sa courbe. */
function Invest() {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [14, 74], [0, 1], { ...clamp, easing: outEase });
  const chips = usePop(44);
  const pts = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    const steps = Math.floor(t * 6) * 0.13;
    return [t * 1500, 300 - (0.08 + steps + 0.04 * Math.sin(i * 1.3) + t * 0.12) * 300] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  return (
    <AbsoluteFill style={{ background: color.night }}>
      <Caption index="04 INVESTIR" text="Investir, en clair." night />
      <div style={{ position: 'absolute', left: 210, top: 300, width: 1500, height: 300, borderRadius: 26, background: 'radial-gradient(circle at 85% 30%, #1d3a66 0%, #0b0f18 45%, #05070c 100%)', boxShadow: '0 0 0 1.5px rgb(242 239 232 / 0.12)', padding: '50px 60px' }}>
        <div style={{ font: `500 26px ${font.body}`, letterSpacing: '0.12em', color: color.nightInkSoft }}>VALEUR DU PORTEFEUILLE</div>
        <div style={{ marginTop: 8, font: `700 120px/1.05 ${font.display}`, letterSpacing: '-0.035em', color: color.nightInk }}>
          <Counter to={8369.19} duration={44} />
        </div>
        <div style={{ marginTop: 6, font: `500 32px ${font.mono}`, color: color.nightPositive }}>
          +<Counter to={1602.19} duration={44} suffix=" € (+23,7 %)" />
        </div>
        <div style={{ position: 'absolute', right: 60, top: 60, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-end', opacity: Math.min(1, chips), transform: `translateX(${(1 - Math.min(1, chips)) * 40}px)` }}>
          {['Trade Republic', 'Binance'].map((p) => (
            <span key={p} style={{ padding: '10px 20px', borderRadius: 999, boxShadow: '0 0 0 1.5px rgb(242 239 232 / 0.25)', font: `500 26px ${font.body}`, color: color.nightInk }}>{p}</span>
          ))}
        </div>
      </div>
      <svg width={1500} height={300} style={{ position: 'absolute', left: 210, top: 660, overflow: 'visible' }}>
        <path d={d} fill="none" stroke={color.nightInk} strokeWidth={5} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
        <path d={`M0,${300 - 0.08 * 300} ${pts.map(([x], i) => `L${x},${300 - (0.06 + Math.floor((i / 59) * 6) * 0.11) * 300}`).join(' ')}`} fill="none" stroke={color.nightInkSoft} strokeWidth={3} strokeDasharray="10 10" opacity={draw} />
      </svg>
    </AbsoluteFill>
  );
}

export const askShots: ShotDef[] = [
  { frames: 28, flash: true, node: <TitleCard index="03" word="Demander" /> },
  { frames: 190, node: <Ask /> },
];

export const investShots: ShotDef[] = [
  { frames: 28, flash: true, node: <TitleCard index="04" word="Investir" tone="night" /> },
  { frames: 96, entrance: 'punch', node: <Invest /> },
];
