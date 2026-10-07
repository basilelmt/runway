import { AlertTriangle, Landmark, Plane, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/api/client';
import { useForecast, useSettings } from '@/api/hooks';
import { BalanceAreaChart } from '@/components/charts/BalanceAreaChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { Amount, Badge, Card, EmptyState, Select, Skeleton, SkeletonRows } from '@/components/ui';
import { formatDateShort, inDays, KIND_LABELS } from '@/lib/format';
import styles from './Forecast.module.css';

type Series = `account-${number}` | `envelope-${number}`;

export function ForecastPage() {
  const settings = useSettings();
  const [horizon, setHorizon] = useState<number | null>(null);
  const effectiveHorizon = horizon ?? settings.data?.forecastHorizonDays ?? 90;
  const forecast = useForecast(effectiveHorizon);
  const [chosenSeries, setSeries] = useState<Series | null>(null);

  const data = forecast.data;

  // Série par défaut : la première alerte, sinon le premier compte.
  const defaultSeries: Series | null = !data ? null : data.alerts[0] ? `${data.alerts[0].kind}-${data.alerts[0].id}` : data.accounts[0] ? `account-${data.accounts[0].id}` : null;
  const series = chosenSeries ?? defaultSeries;

  const selected = useMemo(() => {
    if (!data || !series) return null;
    const [kind, idText] = series.split('-') as ['account' | 'envelope', string];
    const id = Number(idText);
    const name = kind === 'account' ? data.accounts.find((a) => a.id === id)?.name : data.envelopes.find((e) => e.id === id)?.name;
    if (!name) return null;
    const points = data.days.map((d) => ({ date: d.date, value: (kind === 'account' ? d.accounts[id] : d.envelopes[id]) ?? 0 }));
    const events = data.events.filter((e) => (kind === 'account' ? e.accountId === id || e.toAccountId === id : e.envelopeId === id || e.fromEnvelopeId === id));
    return { kind, id, name, points, events };
  }, [data, series]);

  const hasInputs = (data?.events.length ?? 0) > 0;

  return (
    <div className="page">
      <PageHeader
        title="Prévision"
        subtitle="Soldes projetés à partir des récurrences et des opérations prévues."
        actions={
          <label className={styles.horizon}>
            <span>
              Horizon <strong className="mono">{effectiveHorizon} j</strong>
            </span>
            <input type="range" min={30} max={365} step={30} value={effectiveHorizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Horizon de prévision en jours" />
          </label>
        }
      />

      {forecast.isPending ? (
        <SkeletonRows rows={3} />
      ) : forecast.isError ? (
        <EmptyState title="Impossible de calculer la prévision" description={errorMessage(forecast.error)} />
      ) : (
        <>
          {data!.alerts.length === 0 ? (
            <Card tone="marking" padding="sm" className={styles.clear}>
              <Plane size={18} aria-hidden /> Piste dégagée : rien ne passe dans le rouge sur {effectiveHorizon} jours.
            </Card>
          ) : (
            <section>
              <div className="section-title">
                <h2>
                  <AlertTriangle size={16} aria-hidden className={styles.alertIcon} /> Découverts à venir
                </h2>
              </div>
              <div className={styles.table} role="table" aria-label="Découverts à venir">
                <div className={[styles.tr, styles.th].join(' ')} role="row">
                  <span role="columnheader">Quoi</span>
                  <span role="columnheader">Premier jour négatif</span>
                  <span role="columnheader">Dans</span>
                  <span role="columnheader" className={styles.right}>
                    Point bas
                  </span>
                </div>
                {data!.alerts.map((a) => {
                  const key: Series = `${a.kind}-${a.id}`;
                  return (
                    <button key={key} type="button" role="row" className={[styles.tr, series === key ? styles.selected : ''].join(' ')} onClick={() => setSeries(key)} aria-pressed={series === key}>
                      <span role="cell" className={styles.what}>
                        {a.kind === 'account' ? <Landmark size={14} aria-label="Compte" /> : <WalletCards size={14} aria-label="Enveloppe" />}
                        {a.name}
                      </span>
                      <span role="cell" className="mono">
                        {formatDateShort(a.firstNegativeDate)}
                      </span>
                      <span role="cell">
                        <Badge tone={a.daysUntil <= 7 ? 'negative' : 'warning'}>{inDays(a.daysUntil)}</Badge>
                      </span>
                      <span role="cell" className={styles.right}>
                        <Amount cents={a.minBalance} size="sm" /> <span className="muted">le {formatDateShort(a.minBalanceDate)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {!hasInputs && data!.alerts.length === 0 ? (
            <EmptyState
              icon={<Plane />}
              title="Rien à projeter pour l'instant"
              description="Ajoute des récurrences pour voir plus loin : loyer, salaire, abonnements, budget mensuel."
              action={<Link to="/recurrences">Créer une récurrence</Link>}
            />
          ) : (
            <section className={styles.chartSection}>
              <div className="section-title">
                <h2>Solde projeté</h2>
                <Select value={series ?? ''} onChange={(e) => setSeries(e.target.value as Series)} aria-label="Compte ou enveloppe à tracer" className={styles.select}>
                  <optgroup label="Comptes">
                    {data!.accounts.map((a) => (
                      <option key={a.id} value={`account-${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Enveloppes">
                    {data!.envelopes.map((e) => (
                      <option key={e.id} value={`envelope-${e.id}`}>
                        {e.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </div>
              {selected ? (
                <Card padding="sm">
                  <BalanceAreaChart data={selected.points} name={selected.name} today={data!.today} />
                </Card>
              ) : (
                <Skeleton height={260} />
              )}

              {selected ? (
                <div className={styles.events}>
                  <div className="section-title">
                    <h3>À venir pour {selected.name}</h3>
                    <span className="muted">{selected.events.length} événement{selected.events.length > 1 ? 's' : ''}</span>
                  </div>
                  {selected.events.length === 0 ? (
                    <p className="muted">Aucune échéance sur cet horizon.</p>
                  ) : (
                    <div className="ledger">
                      {selected.events.map((e, i) => {
                        const outgoing =
                          (e.kind === 'expense' && selected.kind === 'account') ||
                          (e.kind === 'expense' && selected.kind === 'envelope') ||
                          (e.kind === 'transfer' && e.accountId === selected.id) ||
                          (e.kind === 'allocation' && e.fromEnvelopeId === selected.id);
                        return (
                          <div key={`${e.source}-${e.sourceId}-${e.date}-${i}`} className={styles.event}>
                            <span className="mono muted">{formatDateShort(e.date)}</span>
                            <span className="grow">
                              {e.label} <span className="muted">· {KIND_LABELS[e.kind]}</span>
                            </span>
                            <Badge tone={e.source === 'planned' ? 'info' : 'neutral'}>{e.source === 'planned' ? 'prévue' : 'récurrence'}</Badge>
                            <Amount cents={outgoing ? -e.amount : e.amount} size="sm" tone={outgoing ? 'auto' : 'always'} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  );
}
