import type { ReactNode } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { TitleCard } from '../components/Motion';
import { Card, Caption, clamp, EnvelopePill, eur, Paper, path, Pointer, Sparkle, usePop, type EnvKey } from '../mock/ui';
import { color, font, outEase } from '../theme';
import type { ShotDef } from './types';

const ICONS: Record<string, ReactNode> = {
  card: (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </>
  ),
  debit: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  phone: (
    <>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </>
  ),
};

type Line = { raw: string; date: string; amount: number; name: string; how: string; icon: keyof typeof ICONS; what: string; env: EnvKey };

/** Lignes brutes du relevé, et ce que Claude en comprend. */
const LINES: Line[] = [
  { raw: 'CARTE X4821 20/10 PAYPAL EUROPE STEAM', date: '20 oct.', amount: -19.99, name: 'Steam', how: 'Carte, via PayPal', icon: 'card', what: 'jeu vidéo', env: 'sorties' },
  { raw: 'PRLV SEPA FREE MOBILE FM-2210', date: '20 oct.', amount: -15.99, name: 'Free Mobile', how: 'Prélèvement mensuel', icon: 'debit', what: 'forfait téléphone', env: 'abonnements' },
  { raw: 'CARTE X4821 19/10 RELAY GARE DE LYON', date: '19 oct.', amount: -6.8, name: 'Relay', how: 'Carte, sans contact', icon: 'card', what: 'achat en gare', env: 'transports' },
  { raw: 'CARTE X4821 16/10 SUMUP *LA CAVE DE LOUIS', date: '16 oct.', amount: -36.93, name: 'La Cave de Louis', how: 'Carte, terminal SumUp', icon: 'card', what: 'caviste', env: 'courses' },
  { raw: 'PAYLIB 10/10 VINTED', date: '10 oct.', amount: -16.39, name: 'Vinted', how: 'Paylib, sur mobile', icon: 'phone', what: 'vêtements d’occasion', env: 'shopping' },
];

/** Le relevé tel que la banque l'exporte tombe dans Runway. */
function Drop() {
  const frame = useCurrentFrame();
  const p = path(frame, [
    [0, 1500, 120],
    [26, 1150, 690],
  ]);
  const dropped = frame >= 30;
  const flash = frame < 30 ? 0 : interpolate(frame, [30, 44], [1, 0], clamp);
  const stats = usePop(34);
  return (
    <Paper>
      <Caption index="02 CLAUDE RANGE" text={'Ton relevé\nbancaire,\ntel quel.'} />
      <Card style={{ left: 760, top: 210, width: 1064, height: 640, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 34, borderRadius: 18, border: `3px dashed ${dropped ? color.marking : color.rule}`, background: `rgb(232 185 49 / ${flash * 0.25})` }} />
        <div style={{ textAlign: 'center', opacity: dropped ? 0 : 1 }}>
          <div style={{ font: `600 38px ${font.body}`, color: color.ink }}>Dépose ici un relevé La Banque Postale</div>
          <div style={{ marginTop: 12, font: `400 28px ${font.body}`, color: color.inkMute }}>Export CSV ou relevé PDF</div>
        </div>
        {dropped ? (
          <div style={{ position: 'absolute', textAlign: 'center', opacity: Math.min(1, stats), transform: `scale(${0.9 + 0.1 * stats})` }}>
            <div style={{ font: `500 30px ${font.mono}`, color: color.inkMute }}>releve-octobre.csv</div>
            <div style={{ display: 'flex', gap: 56, marginTop: 30 }}>
              {[
                ['5', 'nouvelles'],
                ['1', 'rapprochée'],
                ['1', 'doublon ignoré'],
              ].map(([n, label]) => (
                <div key={label}>
                  <div style={{ font: `500 84px ${font.mono}`, color: color.ink }}>{n}</div>
                  <div style={{ font: `400 28px ${font.body}`, color: color.inkMute }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
      {!dropped ? (
        <>
          <div style={{ position: 'absolute', left: p.x + 26, top: p.y + 30, display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderRadius: 14, background: color.paperRaised, boxShadow: '0 20px 40px rgb(20 32 28 / 0.25)', font: `500 30px ${font.mono}`, color: color.ink, transform: 'rotate(-3deg)' }}>
            <span style={{ padding: '4px 10px', borderRadius: 6, background: color.positive, color: color.paper, font: `600 20px ${font.body}` }}>CSV</span>
            releve-octobre.csv
          </div>
          <Pointer x={p.x} y={p.y} />
        </>
      ) : null}
    </Paper>
  );
}

const ROW = 128;
const SCAN = (i: number) => 36 + i * 28;

/** Claude passe sur chaque ligne : il reconnaît le marchand et le moyen de paiement, et pose la bonne enveloppe. */
function Sort() {
  const frame = useCurrentFrame();
  const button = usePop(0);
  const rules = usePop(SCAN(LINES.length - 1) + 20);
  const pointer = path(frame, [
    [0, 1500, 500],
    [16, 1680, 206],
  ]);
  return (
    <Paper>
      <Caption index="02 CLAUDE RANGE" text={'Claude reconnaît\nchaque dépense\net la range.'} size={66} />
      <div style={{ position: 'absolute', left: 96, top: 560, width: 560, opacity: Math.min(1, rules), transform: `translateY(${(1 - Math.min(1, rules)) * 24}px)` }}>
        <div style={{ font: `400 30px/1.4 ${font.body}`, color: color.inkSoft }}>Le marchand, la façon dont tu as payé, ce que c’est : chaque choix s’explique.</div>
        <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderRadius: 12, background: color.markingSoft, font: `500 28px ${font.body}`, color: color.markingOn }}>
          <Sparkle size={26} /> 5 règles créées pour la prochaine fois
        </div>
      </div>

      <Card style={{ left: 740, top: 150, width: 1084, padding: '26px 34px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 }}>
          <span style={{ font: `700 38px ${font.display}`, color: color.ink }}>À ranger</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 12, background: color.marking, color: color.markingOn, font: `600 26px ${font.body}`, transform: `scale(${(frame >= 18 && frame < 23 ? 0.94 : 1) * Math.min(1, button)})` }}>
            <Sparkle size={26} /> Trier avec Claude
          </span>
        </div>
        {LINES.map((line, i) => {
          const scan = interpolate(frame, [SCAN(i) - 12, SCAN(i)], [0, 1], { ...clamp, easing: outEase });
          const done = popAt(frame, SCAN(i));
          // L'ancien libellé s'efface avant que le nouveau n'apparaisse : les deux ne se superposent jamais.
          const swap = interpolate(frame, [SCAN(i), SCAN(i) + 12], [0, 1], clamp);
          const before = interpolate(swap, [0, 0.45], [1, 0], clamp);
          const after = interpolate(swap, [0.5, 1], [0, 1], clamp);
          const sorted = frame >= SCAN(i);
          return (
            <div key={line.raw} style={{ position: 'relative', height: ROW, display: 'flex', alignItems: 'center', gap: 22, borderTop: `1.5px solid ${color.rule}` }}>
              {/* Le passage de Claude : une bande jaune qui balaie la ligne. */}
              {scan > 0 && frame < SCAN(i) + 10 ? (
                <div style={{ position: 'absolute', left: -34, right: -34, top: 0, bottom: 0, background: `linear-gradient(90deg, transparent ${scan * 100 - 30}%, rgb(232 185 49 / 0.35) ${scan * 100}%, transparent ${scan * 100 + 2}%)`, opacity: interpolate(frame, [SCAN(i), SCAN(i) + 10], [1, 0], clamp) }} />
              ) : null}
              <div style={{ width: 36, display: 'flex', justifyContent: 'center', opacity: sorted ? 1 : scan, transform: `rotate(${scan * 90}deg)` }}>
                <Sparkle size={30} />
              </div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative', height: ROW - 20 }}>
                {/* Avant : le libellé brut de la banque. */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: before, transform: `translateY(${(1 - before) * -20}px)` }}>
                  <div style={{ font: `500 23px ${font.mono}`, color: color.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.raw}</div>
                  <div style={{ marginTop: 6, font: `400 22px ${font.body}`, color: color.inkMute }}>{line.date}</div>
                </div>
                {/* Après : le marchand, le moyen de paiement, ce que c'est. */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, opacity: after, transform: `translateY(${(1 - after) * 20}px)` }}>
                  <div style={{ font: `600 34px ${font.body}`, color: color.ink }}>
                    {line.name} <span style={{ font: `400 26px ${font.body}`, color: color.inkMute }}>· {line.what}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: `500 22px ${font.body}`, color: color.inkSoft, minWidth: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 8, background: color.paperSunken, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {ICONS[line.icon]}
                      </svg>
                      {line.how}
                    </span>
                    <span style={{ font: `400 20px ${font.mono}`, color: color.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{line.raw}</span>
                  </div>
                </div>
              </div>
              <span style={{ width: 140, textAlign: 'right', font: `500 30px ${font.body}`, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{eur(line.amount)}</span>
              <div style={{ width: 230, display: 'flex', justifyContent: 'flex-end' }}>
                <EnvelopePill env={sorted ? line.env : null} tone="suggested" scale={sorted ? 0.8 + 0.2 * done : 1} />
              </div>
            </div>
          );
        })}
      </Card>
      <Pointer x={pointer.x} y={pointer.y} clickAt={18} opacity={interpolate(frame, [28, 36], [1, 0], clamp)} />
    </Paper>
  );
}

/** Apparition avec léger dépassement (courbe « back »), calculée sans hook pour servir dans une boucle. */
function popAt(frame: number, delay: number): number {
  const t = Math.min(1, Math.max(0, (frame - delay) / 12));
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export const sorting: ShotDef[] = [
  { frames: 14, flash: true, node: <TitleCard index="02" word="Claude range" tone="tarmac" /> },
  { frames: 66, node: <Drop /> },
  { frames: 215, entrance: 'whip', node: <Sort /> },
];
