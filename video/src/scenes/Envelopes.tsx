import { interpolate, useCurrentFrame } from 'remotion';
import { TitleCard } from '../components/Motion';
import { Card, Caption, clamp, ENV, eur, Paper, usePop, type EnvKey } from '../mock/ui';
import { color, font, outEase } from '../theme';
import type { ShotDef } from './types';

const SALARY = 2680;

/** Le salaire du mois, découpé en enveloppes (total : 2 680 €). */
const SPLIT: { env: EnvKey; amount: number }[] = [
  { env: 'logement', amount: 890 },
  { env: 'courses', amount: 420 },
  { env: 'transports', amount: 180 },
  { env: 'sorties', amount: 200 },
  { env: 'abonnements', amount: 60 },
  { env: 'sante', amount: 80 },
  { env: 'shopping', amount: 100 },
  { env: 'vacances', amount: 750 },
];

const CARD = { left: 760, top: 150, width: 1064, row: 94 };
const ARRIVE = (i: number) => 20 + i * 11;

/** Répartir : chaque montant part du salaire et remplit son enveloppe ; « À répartir » descend à zéro. */
function Distribute() {
  const frame = useCurrentFrame();
  const left = SALARY - SPLIT.reduce((sum, s, i) => sum + s.amount * interpolate(frame, [ARRIVE(i) + 8, ARRIVE(i) + 12], [0, 1], clamp), 0);
  const done = usePop(ARRIVE(SPLIT.length - 1) + 14);
  return (
    <Paper>
      <Caption index="01 ENVELOPPES" text={'Ton salaire,\nréparti comme\ntu veux.'} />
      <div style={{ position: 'absolute', left: 96, top: 600 }}>
        <div style={{ font: `500 26px ${font.body}`, letterSpacing: '0.12em', color: color.inkMute }}>À RÉPARTIR</div>
        <div style={{ font: `700 112px/1.05 ${font.display}`, letterSpacing: '-0.035em', color: left < 1 ? color.positive : color.ink, fontVariantNumeric: 'tabular-nums' }}>{eur(left)}</div>
        <div style={{ marginTop: 10, font: `500 28px ${font.body}`, color: color.positive, opacity: Math.min(1, done), transform: `translateY(${(1 - Math.min(1, done)) * 12}px)` }}>
          Chaque euro a sa place.
        </div>
      </div>

      <Card style={{ left: CARD.left, top: CARD.top, width: CARD.width, padding: '30px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ font: `700 40px ${font.display}`, color: color.ink }}>Budget</span>
          <span style={{ font: `400 24px ${font.body}`, color: color.inkMute }}>octobre</span>
        </div>
        {SPLIT.map((s, i) => {
          const fill = interpolate(frame, [ARRIVE(i) + 8, ARRIVE(i) + 20], [0, 1], { ...clamp, easing: outEase });
          return (
            <div key={s.env} style={{ height: CARD.row, display: 'flex', alignItems: 'center', gap: 22, borderTop: `1.5px solid ${color.rule}` }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: ENV[s.env].color }} />
              <span style={{ width: 230, font: `500 32px ${font.body}`, color: color.ink }}>{ENV[s.env].name}</span>
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: color.paperSunken, overflow: 'hidden' }}>
                <div style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 6, background: ENV[s.env].color }} />
              </div>
              <span style={{ width: 190, textAlign: 'right', font: `500 32px ${font.body}`, color: fill > 0 ? color.ink : color.inkMute, fontVariantNumeric: 'tabular-nums' }}>{eur(s.amount * fill)}</span>
            </div>
          );
        })}
      </Card>

      {/* Les montants volent du salaire vers leur enveloppe. */}
      {SPLIT.map((s, i) => {
        const t = interpolate(frame, [ARRIVE(i), ARRIVE(i) + 10], [0, 1], { ...clamp, easing: outEase });
        if (t <= 0 || t >= 1) return null;
        const x = 140 + (CARD.left + 330 - 140) * t;
        const y = 690 + (CARD.top + 112 + i * CARD.row - 690) * t - Math.sin(t * Math.PI) * 140;
        return (
          <div key={s.env} style={{ position: 'absolute', left: x, top: y, padding: '8px 16px', borderRadius: 999, background: ENV[s.env].color, color: color.paper, font: `600 28px ${font.body}`, transform: `scale(${1 + Math.sin(t * Math.PI) * 0.25})`, boxShadow: '0 10px 24px rgb(20 32 28 / 0.25)' }}>
            {eur(s.amount, true)}
          </div>
        );
      })}
    </Paper>
  );
}

const OUTINGS: { label: string; amount: number }[] = [
  { label: 'Le Bistrot des Halles', amount: 38.5 },
  { label: 'UGC Ciné Cité', amount: 12.9 },
  { label: 'Deliveroo', amount: 27.4 },
  { label: 'Le Perchoir', amount: 64 },
  { label: 'Concert, La Cigale', amount: 82.5 },
];
const BUDGET = 200;
const HIT = (i: number) => 16 + i * 16;

/** Déborder : les sorties s'empilent, la jauge dépasse son budget, passe au rouge, et l'alerte tombe. */
function Overspend() {
  const frame = useCurrentFrame();
  const spent = OUTINGS.reduce((sum, o, i) => sum + o.amount * interpolate(frame, [HIT(i), HIT(i) + 5], [0, 1], { ...clamp, easing: outEase }), 0);
  const over = spent > BUDGET;
  const overAt = HIT(OUTINGS.length - 1) + 3;
  const shake = over ? Math.sin(frame * 2.2) * interpolate(frame, [overAt, overAt + 12], [10, 0], clamp) : 0;
  const alert = usePop(overAt + 4, 200);
  const ratio = spent / BUDGET;

  return (
    <Paper>
      <Caption index="01 ENVELOPPES" text={'Ça déborde ?\nTu le sais tout de suite.'} size={64} />

      {/* Les dépenses du mois s'ajoutent une à une sous la légende, et la jauge monte d'autant. */}
      <div style={{ position: 'absolute', left: 96, top: 430, width: 580, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {OUTINGS.map((o, i) => {
          const t = interpolate(frame, [HIT(i) - 10, HIT(i)], [0, 1], { ...clamp, easing: outEase });
          return (
            <div key={o.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 22px', borderRadius: 14, background: color.paperRaised, boxShadow: '0 10px 26px rgb(20 32 28 / 0.12)', font: `500 28px ${font.body}`, color: color.ink, opacity: t, transform: `translateX(${(1 - t) * -60}px)` }}>
              <span>{o.label}</span>
              <span style={{ color: color.negative, fontVariantNumeric: 'tabular-nums' }}>{eur(-o.amount)}</span>
            </div>
          );
        })}
      </div>

      <Card style={{ left: 760, top: 300, width: 1064, padding: '34px 40px', transform: `translateX(${shake}px)`, boxShadow: over ? `0 40px 90px rgb(200 65 43 / 0.25), 0 0 0 3px ${color.negative}` : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: ENV.sorties.color }} />
          <span style={{ flex: 1, font: `600 44px ${font.body}`, color: color.ink }}>Sorties</span>
          <span style={{ font: `500 40px ${font.body}`, fontVariantNumeric: 'tabular-nums', color: over ? color.negative : color.ink }}>{eur(spent)}</span>
          <span style={{ font: `400 34px ${font.body}`, color: color.inkMute }}>/ {eur(BUDGET)}</span>
        </div>
        {/* Le budget est au repère, à 80 % de la jauge : le dépassement se voit au-delà, hachuré. */}
        <div style={{ position: 'relative', marginTop: 30, height: 26, borderRadius: 13, background: color.paperSunken }}>
          <div style={{ width: `${Math.min(1, ratio) * 80}%`, height: '100%', borderRadius: '13px 0 0 13px', background: over ? color.negative : ENV.sorties.color }} />
          {over ? (
            <div style={{ position: 'absolute', left: '80%', top: 0, width: `${Math.min(0.25, ratio - 1) * 80}%`, height: '100%', borderRadius: '0 13px 13px 0', background: `repeating-linear-gradient(135deg, ${color.negative} 0 10px, #e58b7a 10px 20px)` }} />
          ) : null}
          <div style={{ position: 'absolute', left: '80%', top: -12, bottom: -12, width: 4, marginLeft: -2, borderRadius: 2, background: color.ink }} />
          <div style={{ position: 'absolute', left: '80%', top: 40, transform: 'translateX(-50%)', font: `500 22px ${font.mono}`, color: color.inkMute }}>budget</div>
        </div>
        <div style={{ marginTop: 44, font: `400 28px ${font.body}`, color: over ? color.negative : color.inkMute }}>
          {over ? `${eur(spent - BUDGET)} de trop ce mois-ci` : `${eur(BUDGET - spent)} disponible`}
        </div>
      </Card>

      {/* L'alerte : la carte « À faire » de l'accueil. */}
      <div
        style={{
          position: 'absolute',
          left: 760,
          top: 640,
          width: 1064,
          opacity: Math.min(1, alert),
          transform: `translateY(${(1 - Math.min(1, alert)) * 60}px) scale(${0.94 + 0.06 * alert})`,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '28px 34px',
          borderRadius: 18,
          background: color.paperRaised,
          borderLeft: `8px solid ${color.negative}`,
          boxShadow: '0 30px 70px rgb(20 32 28 / 0.2)',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={color.negative} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ font: `600 34px ${font.body}`, color: color.ink }}>Sorties dépasse son budget</div>
          <div style={{ font: `400 26px ${font.body}`, color: color.inkMute }}>Prends sur une autre enveloppe pour rester dans les clous.</div>
        </div>
        <span style={{ padding: '12px 22px', borderRadius: 12, background: color.ink, color: color.paper, font: `500 26px ${font.body}` }}>Répartir</span>
      </div>
    </Paper>
  );
}

export const envelopes: ShotDef[] = [
  { frames: 14, flash: true, node: <TitleCard index="01" word="Enveloppes" /> },
  { frames: 150, node: <Distribute /> },
  { frames: 140, entrance: 'whip', node: <Overspend /> },
];
