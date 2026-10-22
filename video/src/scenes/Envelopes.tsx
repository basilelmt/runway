import type { CSSProperties } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Counter, TitleCard, WordsSlam } from '../components/Motion';
import { Card, Caption, clamp, ENV, eur, Paper, path, Pointer, Sparkle, usePop, type EnvKey } from '../mock/ui';
import { color, font, outEase } from '../theme';
import type { ShotDef } from './types';

const SALARY = 2680;

/** Le salaire du mois, découpé en enveloppes (total : 2 680 €) ; ce qui reste part en épargne. */
const SPLIT: { env: EnvKey; amount: number }[] = [
  { env: 'logement', amount: 1000 },
  { env: 'courses', amount: 450 },
  { env: 'sorties', amount: 300 },
  { env: 'vacances', amount: 530 },
  { env: 'epargne', amount: 400 },
];
const SAVINGS = SPLIT.at(-1)!;

const BAR = { left: 96, top: 520, width: 1728, height: 180, gap: 36 };
const GROW = [6, 26];
const CUT = (i: number) => 34 + i * 7;
const OPEN = [CUT(SPLIT.length - 2) + 6, CUT(SPLIT.length - 2) + 20];
const SAVE = OPEN[1]! + 26;

/**
 * Répartir : le salaire est une seule barre, coupée net en enveloppes qui s'écartent et prennent leur couleur.
 * Puis le dernier morceau, l'épargne, se soulève : une fois tout réparti, on voit ce qu'on peut mettre de côté.
 */
function Distribute() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = interpolate(frame, GROW, [0, 1], { ...clamp, easing: outEase });
  const open = interpolate(frame, OPEN, [0, 1], { ...clamp, easing: outEase });
  const gap = BAR.gap * open;
  const unit = (BAR.width - gap * (SPLIT.length - 1)) / SALARY;
  const total = usePop(GROW[0]!);
  const save = usePop(SAVE, 180);

  let x = BAR.left;
  const segments = SPLIT.map((s, i) => {
    const seg = { ...s, i, x, width: s.amount * unit };
    x += seg.width + gap;
    return seg;
  });

  return (
    <Paper>
      <Caption index="01 ENVELOPPES" text="Ton salaire, réparti comme tu veux." />

      <div style={{ position: 'absolute', left: BAR.left, top: BAR.top - 130, font: `700 104px/1 ${font.display}`, letterSpacing: '-0.035em', color: color.ink, opacity: Math.min(1, total), transform: `translateY(${(1 - Math.min(1, total)) * 30}px)` }}>
        <Counter to={SALARY} duration={20} delay={GROW[0]} decimals={0} />
      </div>

      {/* La barre pousse de gauche à droite, puis les segments s'écartent et se colorent. */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: grow < 1 ? BAR.left + BAR.width * grow : '100%', height: '100%', overflow: 'hidden' }}>
        {segments.map((s) => (
          <div
            key={s.env}
            style={{
              position: 'absolute',
              left: s.x,
              top: BAR.top,
              width: s.width,
              height: BAR.height,
              background: open > 0 ? mix(color.tarmac, ENV[s.env].color, open) : color.tarmac,
              // Les coins intérieurs s'arrondissent à mesure que les segments s'écartent.
              borderRadius: `${s.i === 0 ? 20 : 20 * open}px ${s.i === SPLIT.length - 1 ? 20 : 20 * open}px ${s.i === SPLIT.length - 1 ? 20 : 20 * open}px ${s.i === 0 ? 20 : 20 * open}px`,
              ...lift(s.env, save, 0, true),
            }}
          />
        ))}
      </div>

      {/* Les coupes : un trait jaune tombe à chaque frontière, juste avant que la barre ne s'ouvre. */}
      {segments.slice(1).map((s, k) => {
        const t = interpolate(frame, [CUT(k), CUT(k) + 5], [0, 1], { ...clamp, easing: outEase });
        const fade = interpolate(frame, [OPEN[0]!, OPEN[0]! + 6], [1, 0], clamp);
        if (t <= 0 || fade <= 0) return null;
        return <div key={s.env} style={{ position: 'absolute', left: s.x - gap / 2 - 4, top: BAR.top - 40, width: 8, height: (BAR.height + 80) * t, borderRadius: 4, background: color.marking, opacity: fade }} />;
      })}

      {segments.map((s) => {
        const p = Math.min(1, spring({ frame: frame - OPEN[0]! - 6 - s.i * 4, fps, config: { damping: 14, stiffness: 220, mass: 0.6 } }));
        return (
          <div key={s.env} style={{ position: 'absolute', left: s.x, top: BAR.top + BAR.height + 30, width: s.width, display: 'flex', flexDirection: 'column', opacity: p, whiteSpace: 'nowrap', ...lift(s.env, save, (1 - p) * 24) }}>
            <span style={{ font: `500 34px ${font.body}`, color: color.inkSoft }}>{ENV[s.env].name}</span>
            <span style={{ font: `700 48px/1.2 ${font.display}`, letterSpacing: '-0.02em', color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{`${s.amount.toLocaleString('fr-FR').replace(/ /g, ' ')} €`}</span>
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: BAR.left, top: 890 }}>
        <WordsSlam text={`Et ${SAVINGS.amount} € de côté.`} size={84} color={color.ink} delay={SAVE + 4} />
      </div>
    </Paper>
  );
}

/** L'épargne se soulève et brille ; les autres enveloppes passent au second plan. */
function lift(env: EnvKey, save: number, offset = 0, glow = false): CSSProperties {
  if (env !== SAVINGS.env) return { opacity: 1 - 0.45 * Math.min(1, save), transform: `translateY(${offset}px)` };
  const style: CSSProperties = { transform: `translateY(${offset - 28 * save}px)` };
  return glow ? { ...style, boxShadow: `0 ${24 * save}px ${50 * save}px rgb(232 185 49 / ${0.45 * Math.min(1, save)})` } : style;
}

/** Mélange linéaire de deux couleurs hexadécimales. */
function mix(from: string, to: string, t: number): string {
  const a = from.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const b = to.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(' ')})`;
}

const AREA = { left: 760, top: 220, width: 1064, height: 664, gap: 24 };
/** Sorties ouverte : un peu plus haute que la grille, pour loger ses dépenses. */
const OPENED = { left: 760, top: 200, width: 1064, height: 680 };
const TILE = { width: (AREA.width - AREA.gap) / 2, height: (AREA.height - AREA.gap) / 2 };
const LAND = (i: number) => 22 + i * 10;
const CLICK = 84;

/** Les enveloppes du mois en cours, avant que les dépenses rangées par Claude n'y tombent. */
const MONTH: { env: EnvKey; spent: number; budget: number }[] = [
  { env: 'logement', spent: 1000, budget: 1000 },
  { env: 'sorties', spent: 295.4, budget: 300 },
  { env: 'courses', spent: 275.47, budget: 450 },
  { env: 'vacances', spent: 120, budget: 530 },
];

/** Deux dépenses du tri de Claude (plan précédent) : le bar fait passer Sorties dans le rouge. */
const SORTED: { label: string; amount: number; env: EnvKey }[] = [
  { label: 'Le Syndicat', amount: -29.9, env: 'sorties' },
  { label: 'La Cave de Louis', amount: -36.93, env: 'courses' },
];

/** Le détail de Sorties : le concert explique le rouge, et un resto avancé pour Léa. */
const OUTINGS: { label: string; amount: number; culprit?: boolean; advance?: string; sorted?: boolean }[] = [
  { label: 'Concert, La Cigale', amount: -82.5, culprit: true },
  { label: 'Le Perchoir', amount: -64, advance: 'Léa te doit 32 €' },
  { label: 'Le Bistrot des Halles', amount: -38.5 },
  { label: 'Le Syndicat', amount: -29.9, sorted: true },
];

/**
 * Anomalies : les dépenses rangées par Claude tombent dans leurs enveloppes, Sorties dépasse et passe au rouge ;
 * un clic l'ouvre et montre la dépense en cause, et ce qu'on te doit.
 */
function Anomalies() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = interpolate(frame, [CLICK + 2, CLICK + 18], [0, 1], { ...clamp, easing: outEase });
  const pointer = path(frame, [
    [CLICK - 30, 1500, 1040],
    [CLICK - 4, AREA.left + TILE.width + AREA.gap + TILE.width / 2, AREA.top + TILE.height / 2],
  ]);
  return (
    <Paper>
      <Caption index="02 CLAUDE RANGE" text={'Ce qui cloche\nsaute aux yeux.'} />
      {MONTH.map((m, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const landed = SORTED.reduce((sum, d, k) => (d.env === m.env ? sum - d.amount * interpolate(frame, [LAND(k) + 22, LAND(k) + 28], [0, 1], { ...clamp, easing: outEase }) : sum), 0);
        const spent = m.spent + landed;
        const over = spent > m.budget;
        const hit = SORTED.findIndex((d) => d.env === m.env);
        const bump = hit < 0 ? 0 : interpolate(frame, [LAND(hit) + 24, LAND(hit) + 28, LAND(hit) + 36], [0, 1, 0], clamp);
        const pop = Math.min(1, spring({ frame: frame - 4 - i * 4, fps, config: { damping: 14, stiffness: 220, mass: 0.6 } }));
        const tile = { left: AREA.left + col * (TILE.width + AREA.gap), top: AREA.top + row * (TILE.height + AREA.gap), width: TILE.width, height: TILE.height };
        // Sorties s'agrandit jusqu'à occuper toute la zone ; les autres s'effacent.
        const rect = m.env === 'sorties'
          ? { left: tile.left + (OPENED.left - tile.left) * open, top: tile.top + (OPENED.top - tile.top) * open, width: tile.width + (OPENED.width - tile.width) * open, height: tile.height + (OPENED.height - tile.height) * open }
          : tile;
        const pulse = (over && frame < CLICK ? 1 + 0.025 * Math.max(0, Math.sin((frame - LAND(0) - 28) / 3.2)) : 1) * (1 + 0.04 * bump);
        const press = over && frame >= CLICK && frame < CLICK + 4 ? 0.97 : 1;
        return (
          <Card
            key={m.env}
            style={{
              ...rect,
              padding: '34px 40px',
              zIndex: m.env === 'sorties' ? 1 : 0,
              opacity: m.env === 'sorties' ? pop : pop * (1 - open),
              transform: `scale(${(0.9 + 0.1 * pop) * pulse * press})`,
              boxShadow: over ? `0 30px 70px rgb(200 65 43 / 0.25), 0 0 0 4px ${color.negative}` : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: ENV[m.env].color }} />
              <span style={{ flex: 1, font: `600 38px ${font.body}`, color: color.ink }}>{ENV[m.env].name}</span>
              {over && open > 0 ? (
                <span style={{ font: `500 34px ${font.body}`, color: color.negative, opacity: open, fontVariantNumeric: 'tabular-nums' }}>
                  {amount(spent)} <span style={{ color: color.inkMute }}>/ {amount(m.budget)}</span>
                </span>
              ) : null}
            </div>
            <div style={{ opacity: 1 - open, height: open > 0.5 ? 0 : undefined, overflow: 'hidden' }}>
              <div style={{ marginTop: 34, font: `700 72px/1 ${font.display}`, letterSpacing: '-0.03em', color: over ? color.negative : color.ink, fontVariantNumeric: 'tabular-nums' }}>{amount(spent)}</div>
              <div style={{ marginTop: 6, font: `400 30px ${font.body}`, color: color.inkMute }}>sur {amount(m.budget)}</div>
              <Gauge ratio={spent / m.budget} tint={over ? color.negative : ENV[m.env].color} />
            </div>
            {m.env === 'sorties' ? <Detail frame={frame} /> : null}
          </Card>
        );
      })}
      {/* Les dépenses rangées par Claude partent de la gauche et tombent dans leur enveloppe. */}
      {SORTED.map((d, k) => {
        const t = interpolate(frame, [LAND(k), LAND(k) + 24], [0, 1], { ...clamp, easing: (v) => v * v * (3 - 2 * v) });
        if (t <= 0 || t >= 1) return null;
        const i = MONTH.findIndex((m) => m.env === d.env);
        const toX = AREA.left + (i % 2) * (TILE.width + AREA.gap) + 40;
        const toY = AREA.top + Math.floor(i / 2) * (TILE.height + AREA.gap) + 110;
        const x = 96 + (toX - 96) * t;
        const y = 560 + (toY - 560) * t - Math.sin(t * Math.PI) * 120;
        return (
          <div key={d.label} style={{ position: 'absolute', left: x, top: y, zIndex: 2, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderRadius: 999, background: color.paperRaised, boxShadow: '0 16px 36px rgb(20 32 28 / 0.22)', font: `500 30px ${font.body}`, color: color.ink, opacity: interpolate(t, [0, 0.1, 0.85, 1], [0, 1, 1, 0]), transform: `scale(${1.15 - 0.4 * t})`, transformOrigin: 'left center', whiteSpace: 'nowrap' }}>
            <Sparkle size={26} /> {d.label} <span style={{ color: color.negative }}>{eur(d.amount)}</span>
          </div>
        );
      })}
      <Pointer x={pointer.x} y={pointer.y} clickAt={CLICK} opacity={interpolate(frame, [CLICK - 30, CLICK - 24, CLICK + 10, CLICK + 18], [0, 1, 1, 0], clamp)} />
    </Paper>
  );
}

/** Jauge d'enveloppe : le budget au repère de 80 %, le dépassement hachuré au-delà. */
function Gauge({ ratio, tint }: { ratio: number; tint: string }) {
  return (
    <div style={{ position: 'relative', marginTop: 30, height: 20, borderRadius: 10, background: color.paperSunken }}>
      <div style={{ width: `${Math.min(1, ratio) * 80}%`, height: '100%', borderRadius: ratio > 1 ? '10px 0 0 10px' : 10, background: tint }} />
      {ratio > 1 ? <div style={{ position: 'absolute', left: '80%', top: 0, width: `${Math.min(0.25, ratio - 1) * 80}%`, height: '100%', borderRadius: '0 10px 10px 0', background: `repeating-linear-gradient(135deg, ${color.negative} 0 10px, #e58b7a 10px 20px)` }} /> : null}
      <div style={{ position: 'absolute', left: '80%', top: -10, bottom: -10, width: 4, marginLeft: -2, borderRadius: 2, background: color.ink }} />
    </div>
  );
}

/** Les dépenses de Sorties, qui arrivent une à une une fois l'enveloppe ouverte. */
function Detail({ frame }: { frame: number }) {
  return (
    <div style={{ marginTop: 26 }}>
      {OUTINGS.map((o, i) => {
        const t = interpolate(frame, [CLICK + 16 + i * 5, CLICK + 26 + i * 5], [0, 1], { ...clamp, easing: outEase });
        const mark = interpolate(frame, [CLICK + 46, CLICK + 54], [0, 1], clamp);
        return (
          <div
            key={o.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              height: 128,
              padding: '0 40px',
              margin: '0 -40px',
              borderTop: `1.5px solid ${color.rule}`,
              background: o.culprit ? `rgb(200 65 43 / ${0.12 * mark})` : undefined,
              boxShadow: o.culprit ? `inset 8px 0 0 rgb(200 65 43 / ${mark})` : undefined,
              opacity: t,
              transform: `translateY(${(1 - t) * 24}px)`,
            }}
          >
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, font: `500 36px ${font.body}`, color: color.ink }}>
              {o.label}
              {o.sorted ? <Sparkle size={28} /> : null}
            </span>
            {o.advance ? (
              <span style={{ padding: '8px 18px', borderRadius: 999, background: color.markingSoft, border: `2px solid ${color.marking}`, font: `500 28px ${font.body}`, color: color.markingOn, opacity: mark, transform: `scale(${0.85 + 0.15 * mark})` }}>
                Avance · {o.advance}
              </span>
            ) : null}
            <span style={{ width: 190, textAlign: 'right', font: `500 36px ${font.body}`, color: o.culprit && mark > 0.5 ? color.negative : color.ink, fontVariantNumeric: 'tabular-nums' }}>{eur(o.amount)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Montant arrondi à l'euro, ou au centime s'il en a. */
function amount(value: number): string {
  return Number.isInteger(value) ? `${value.toLocaleString('fr-FR').replace(/ /g, ' ')} €` : eur(value);
}


export const envelopes: ShotDef[] = [
  { frames: 28, flash: true, node: <TitleCard index="01" word="Enveloppes" /> },
  { frames: 150, node: <Distribute /> },
];

/** Après le tri par Claude : l'enveloppe qui déborde. */
export const anomalies: ShotDef[] = [{ frames: 210, entrance: 'whip', node: <Anomalies /> }];
