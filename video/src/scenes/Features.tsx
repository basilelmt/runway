import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Plane } from '../components/Brand';
import { Counter, TitleCard } from '../components/Motion';
import { Card, Caption, clamp, eur, Paper, path, Pointer, Sparkle, usePop } from '../mock/ui';
import { color, font, outEase } from '../theme';
import type { ShotDef } from './types';

const QUESTION = 'Pourquoi Sorties est dans le rouge ?';
const ANSWER = 'Cinq sorties ce mois-ci, dont un concert à la Cigale à 82,50 € le 18. Je te propose de prendre 25,30 € sur Vacances pour revenir à zéro.';

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
      <div style={{ position: 'absolute', left: 96, top: 520, width: 560, font: `400 30px/1.45 ${font.body}`, color: color.inkSoft }}>
        Claude lit tes données sans rien modifier, et te propose des actions que tu valides d’un clic.
      </div>

      <Card style={{ left: 820, top: 70, width: 980, height: 940, padding: '30px 40px', display: 'flex', flexDirection: 'column' }}>
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
                <Counter to={225.3} delay={44} duration={20} />
              </span>
              <span style={{ font: `400 28px ${font.body}`, color: color.inkMute }}>pour 200,00 € prévus</span>
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
            {sent ? 'Combien en restos depuis mars ?' : typed}
            {!sent && frame % 16 < 9 ? <span style={{ color: color.ink }}>|</span> : null}
          </div>
        </div>
      </Card>
      {frame >= 118 ? <Pointer x={p.x} y={p.y} clickAt={140} /> : null}
    </Paper>
  );
}

const STRIP = { left: 160, top: 300, width: 1600, height: 170 };
const RED_AT = 0.2;

/** Prévision : l'avion roule sur la piste, qui rougit au premier découvert ; la courbe plonge sous zéro. */
function Forecast() {
  const frame = useCurrentFrame();
  const red = interpolate(frame, [30, 48], [0, 1], { ...clamp, easing: outEase });
  const roll = interpolate(frame, [8, 42], [0.02, RED_AT - 0.035], { ...clamp, easing: outEase });
  const status = usePop(42);
  const draw = interpolate(frame, [52, 110], [0, 1], { ...clamp, easing: outEase });
  // Solde de Transports : 166 €, puis -245 € le 26 (assurance auto), remonté par le budget du 1er.
  const points: [number, number][] = [
    [0, 166],
    [0.06, 166],
    [0.06, -245],
    [0.12, -245],
    [0.12, 94],
    [0.45, 94],
    [0.45, 188],
    [0.78, 188],
    [0.78, 280],
    [1, 280],
  ];
  const W = 1600;
  const H = 360;
  const y = (v: number) => H / 2 - (v / 320) * (H / 2) * 0.9;
  const d = points.map(([x, v], i) => `${i ? 'L' : 'M'}${x * W},${y(v)}`).join(' ');
  return (
    <Paper>
      <Caption index="04 PRÉVISION" text="Vois venir le découvert." />
      <div style={{ position: 'absolute', left: STRIP.left, top: STRIP.top - 70, font: `600 40px ${font.body}`, color: color.negative, opacity: Math.min(1, status), transform: `translateX(${(1 - Math.min(1, status)) * -30}px)` }}>
        Découvert dans 5 j · Transports · {eur(-245.29)}
      </div>
      <div style={{ position: 'absolute', left: STRIP.left, top: STRIP.top, width: STRIP.width, height: STRIP.height, borderRadius: 18, background: color.tarmac, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: `${RED_AT * 100}%`, top: 0, bottom: 0, right: `${(1 - red) * (1 - RED_AT) * 100}%`, background: '#9e3324' }} />
        <div style={{ position: 'absolute', left: 30, right: 30, top: '50%', height: 8, marginTop: -4, backgroundImage: `repeating-linear-gradient(90deg, ${color.marking} 0 50px, transparent 50px 90px)`, opacity: 0.85 }} />
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: `${((i + 1) / 13) * 100}%`, top: 14, font: `400 20px ${font.mono}`, color: 'rgb(238 242 239 / 0.6)' }}>
            {['28 oct.', '4 nov.', '11 nov.', '18 nov.', '25 nov.', '2 déc.', '9 déc.', '16 déc.', '23 déc.', '30 déc.', '6 janv.', '13 janv.'][i]}
          </div>
        ))}
        <div style={{ position: 'absolute', left: 14, top: 26, bottom: 26, width: 10, backgroundImage: `repeating-linear-gradient(0deg, ${color.marking} 0 12px, transparent 12px 20px)` }} />
        <div style={{ position: 'absolute', left: `calc(${roll * 100}% - 30px)`, top: '50%', marginTop: -36 }}>
          <Plane size={72} />
        </div>
      </div>
      <svg width={W} height={H} style={{ position: 'absolute', left: STRIP.left, top: 560, overflow: 'visible' }}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={color.rule} strokeWidth={2} strokeDasharray="8 8" />
        <rect x={0.06 * W} y={y(0)} width={0.06 * W} height={y(-245) - y(0)} fill="rgb(200 65 43 / 0.18)" opacity={draw > 0.12 ? 1 : 0} />
        <path d={d} fill="none" stroke={color.positive} strokeWidth={5} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
        <path d={`M${0.06 * W},${y(-245)} L${0.12 * W},${y(-245)}`} stroke={color.negative} strokeWidth={6} opacity={draw > 0.15 ? 1 : 0} />
        <text x={0.13 * W} y={y(-245) + 10} fill={color.negative} style={{ font: `600 30px ${font.body}` }} opacity={draw > 0.2 ? 1 : 0}>
          Assurance auto, le 26 : {eur(-412)}
        </text>
      </svg>
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
      <Caption index="05 INVESTIR" text="Investir, en clair." night />
      <div style={{ position: 'absolute', left: 210, top: 300, width: 1500, height: 300, borderRadius: 26, background: 'radial-gradient(circle at 85% 30%, #1d3a66 0%, #0b0f18 45%, #05070c 100%)', boxShadow: '0 0 0 1.5px rgb(242 239 232 / 0.12)', padding: '50px 60px' }}>
        <div style={{ font: `500 26px ${font.body}`, letterSpacing: '0.12em', color: color.nightInkSoft }}>VALEUR DU PORTEFEUILLE</div>
        <div style={{ marginTop: 8, font: `700 120px/1.05 ${font.display}`, letterSpacing: '-0.035em', color: color.nightInk }}>
          <Counter to={8369.19} duration={44} />
        </div>
        <div style={{ marginTop: 6, font: `500 32px ${font.mono}`, color: color.nightPositive }}>
          +<Counter to={1602.19} duration={44} suffix=" € (+23,7 %)" /> <span style={{ color: color.nightInkSoft, font: `400 28px ${font.body}` }}>de plus-value latente</span>
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
      <div style={{ position: 'absolute', left: 210, top: 1000, font: `400 26px ${font.body}`, color: color.nightInkSoft, opacity: draw }}>
        Des idées tirées de l’actualité, jugées face au S&amp;P 500.
      </div>
    </AbsoluteFill>
  );
}

export const askShots: ShotDef[] = [
  { frames: 28, flash: true, node: <TitleCard index="03" word="Demander" /> },
  { frames: 190, node: <Ask /> },
];

export const forecastShots: ShotDef[] = [
  { frames: 28, flash: true, node: <TitleCard index="04" word="Prévision" tone="tarmac" /> },
  { frames: 128, entrance: 'punch', node: <Forecast /> },
];

export const investShots: ShotDef[] = [
  { frames: 28, flash: true, node: <TitleCard index="05" word="Investir" tone="night" /> },
  { frames: 96, entrance: 'punch', node: <Invest /> },
];
