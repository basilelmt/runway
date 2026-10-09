import { Landmark, Plane, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage } from '@/api/client';
import { useForecast, useSettings } from '@/api/hooks';
import { BalanceAreaChart } from '@/components/charts/BalanceAreaChart';
import { RunwayStrip } from '@/components/dashboard/RunwayStrip';
import { Amount, Badge, ButtonLink, ColumnHeader, EmptyState, ErrorState, FilterPill, ListRow, ListRowSkeleton, listRowDate, Range, SectionHeader, Skeleton } from '@/components/ui';
import { formatDateCompact, inDays, KIND_LABELS, plural } from '@/lib/format';
import styles from './Upcoming.module.css';

type Series = `account-${number}` | `envelope-${number}`;

/** Ce qui arrive : soldes projetés, découverts à venir, échéances. */
export function Upcoming() {
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
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <p className={styles.intro}>Soldes projetés à partir de tes charges fixes, des opérations prévues et du budget mensuel de tes enveloppes.</p>
        <label className={styles.horizon}>
          <span>
            Horizon <strong className="num">{effectiveHorizon} jours</strong>
          </span>
          <Range min={30} max={365} step={30} value={effectiveHorizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Horizon de prévision en jours" />
        </label>
      </div>

      {data ? <RunwayStrip forecast={data} /> : null}

      {forecast.isPending ? (
        <ListRowSkeleton rows={3} />
      ) : forecast.isError ? (
        <ErrorState title="Impossible de calculer la prévision" description={errorMessage(forecast.error)} onRetry={() => forecast.refetch()} />
      ) : (
        <>
          {data!.alerts.length === 0 ? null : (
            <section aria-labelledby="overdrafts-title">
              <SectionHeader id="overdrafts-title" title="Découverts à venir" />
              <ColumnHeader
                title={
                  <span className={styles.columnTitle}>
                    <span className={listRowDate}>Négatif le</span>
                    Quoi
                  </span>
                }
                trail="Point bas"
              />
              <ul className={['ledger', styles.list].join(' ')}>
                {data!.alerts.map((a) => {
                  const key: Series = `${a.kind}-${a.id}`;
                  return (
                    <ListRow
                      key={key}
                      onClick={() => setSeries(key)}
                      clickLabel={`Tracer le solde projeté de ${a.name}`}
                      className={series === key ? styles.selected : undefined}
                      lead={<span className={listRowDate}>{formatDateCompact(a.firstNegativeDate)}</span>}
                      title={
                        <span className={styles.what}>
                          {a.kind === 'account' ? <Landmark size={14} aria-label="Compte" /> : <WalletCards size={14} aria-label="Enveloppe" />}
                          <span className={styles.name}>{a.name}</span>
                        </span>
                      }
                      meta={<Badge tone={a.daysUntil <= 7 ? 'negative' : 'warning'}>{inDays(a.daysUntil)}</Badge>}
                      trail={<Amount cents={a.minBalance} />}
                      trailSub={`le ${formatDateCompact(a.minBalanceDate)}`}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          {!hasInputs && data!.alerts.length === 0 ? (
            <EmptyState
              icon={<Plane />}
              title="Rien à projeter pour l'instant"
              description="Ajoute tes charges fixes et revenus (loyer, salaire, abonnements) dans le Budget pour voir plus loin."
              action={<ButtonLink to="/budget">Aller au Budget</ButtonLink>}
            />
          ) : (
            <section aria-labelledby="projection-title" className={styles.chartSection}>
              <SectionHeader
                id="projection-title"
                title="Solde projeté"
                aside={
                  <FilterPill value={series ?? ''} onChange={(v) => setSeries(v as Series)} aria-label="Compte ou enveloppe à tracer">
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
                  </FilterPill>
                }
              />
              {selected ? <BalanceAreaChart data={selected.points} name={selected.name} today={data!.today} /> : <Skeleton height={260} />}

              {selected ? (
                <div className={styles.events}>
                  <SectionHeader as="h3" title={`À venir pour ${selected.name}`} aside={<span className={styles.count}>{plural(selected.events.length, 'événement')}</span>} />
                  {selected.events.length === 0 ? (
                    <EmptyState title="Aucune échéance sur cet horizon" />
                  ) : (
                    <ul className={['ledger', styles.list].join(' ')}>
                      {selected.events.map((e, i) => {
                        const outgoing =
                          (e.kind === 'expense' && selected.kind === 'account') ||
                          (e.kind === 'expense' && selected.kind === 'envelope') ||
                          (e.kind === 'transfer' && e.accountId === selected.id) ||
                          (e.kind === 'allocation' && e.fromEnvelopeId === selected.id);
                        return (
                          <ListRow
                            key={`${e.source}-${e.sourceId}-${e.date}-${i}`}
                            lead={<span className={listRowDate}>{formatDateCompact(e.date)}</span>}
                            title={e.label}
                            meta={
                              <>
                                {KIND_LABELS[e.kind]}
                                {e.source === 'rule' ? null : <Badge tone={e.source === 'planned' ? 'info' : 'neutral'}>{e.source === 'planned' ? 'prévue' : 'budget'}</Badge>}
                              </>
                            }
                            trail={<Amount cents={outgoing ? -e.amount : e.amount} size="sm" tone={outgoing ? 'neutral' : 'always'} />}
                          />
                        );
                      })}
                    </ul>
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
