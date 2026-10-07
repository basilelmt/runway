import { AlertTriangle, ArrowRight, Inbox, Landmark, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/api/client';
import { useCreateTransaction, useForecast, useOverview } from '@/api/hooks';
import { Sparkline } from '@/components/charts/Sparkline';
import { RunwayStrip } from '@/components/dashboard/RunwayStrip';
import { PageHeader } from '@/components/layout/PageHeader';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Amount, Badge, Button, Card, Dialog, Dot, EmptyState, ProgressBar, Skeleton, SkeletonRows, useToast } from '@/components/ui';
import { formatDateShort, inDays, plural } from '@/lib/format';
import styles from './Dashboard.module.css';

export function DashboardPage() {
  const overview = useOverview();
  const forecast = useForecast();
  const toast = useToast();
  const [dialog, setDialog] = useState<'allocate' | 'new' | null>(null);
  const create = useCreateTransaction({
    onSuccess: () => {
      toast.success(dialog === 'allocate' ? 'Allocation enregistrée' : 'Opération enregistrée');
      setDialog(null);
    },
  });

  if (overview.isError) {
    return (
      <div className="page">
        <PageHeader title="Tableau de bord" />
        <EmptyState title="Impossible de charger le tableau de bord" description={errorMessage(overview.error)} action={<Button onClick={() => overview.refetch()}>Réessayer</Button>} />
      </div>
    );
  }

  const data = overview.data;

  if (data && data.accounts.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Tableau de bord" />
        <EmptyState
          icon={<Landmark />}
          title="Commence par un compte"
          description="Crée ton compte courant avec son solde actuel, puis des enveloppes pour découper ton budget."
          action={
            <Button variant="primary" onClick={() => undefined} icon={<ArrowRight />}>
              <Link to="/comptes" className={styles.plainLink}>
                Créer un compte
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Tableau de bord"
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog('allocate')} icon={<Sparkles />}>
              Allouer
            </Button>
            <Button variant="primary" onClick={() => setDialog('new')} icon={<Plus />}>
              Nouvelle opération
            </Button>
          </>
        }
      />

      {forecast.data ? <RunwayStrip forecast={forecast.data} /> : <Skeleton height={96} />}

      {data ? (
        <>
          <div className={styles.hero}>
            <Card className={styles.toAllocate}>
              <span className="eyebrow">À répartir</span>
              <Amount cents={data.toAllocate} size="xl" />
              <p className="muted">{data.toAllocate < 0 ? 'Tu as alloué plus que ce que tes comptes contiennent.' : 'Argent arrivé sur tes comptes, pas encore rangé dans une enveloppe.'}</p>
              <div className={styles.heroLinks}>
                {data.unsortedCount > 0 ? (
                  <Link to="/a-trier" className={styles.unsortedLink}>
                    <Badge tone="marking">
                      <Inbox size={12} /> {plural(data.unsortedCount, 'opération à trier', 'opérations à trier')}
                    </Badge>
                  </Link>
                ) : null}
                {data.plannedCount > 0 ? (
                  <Link to="/operations?status=planned" className={styles.plainLink}>
                    <Badge tone="info">{plural(data.plannedCount, 'opération prévue', 'opérations prévues')}</Badge>
                  </Link>
                ) : null}
              </div>
            </Card>
            <Card className={styles.netWorth}>
              <div className="spread">
                <span className="eyebrow">Valeur nette</span>
                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  6 mois
                </span>
              </div>
              <Amount cents={data.netWorth} size="lg" tone="neutral" />
              <Sparkline data={data.netWorthSparkline} label="Valeur nette" />
            </Card>
          </div>

          {data.alerts.length > 0 ? (
            <Card tone="negative" padding="sm" className={styles.alerts}>
              <div className="spread">
                <h2 className={styles.alertsTitle}>
                  <AlertTriangle size={16} aria-hidden /> {plural(data.alerts.length, 'découvert à venir', 'découverts à venir')}
                </h2>
                <Link to="/prevision" className={styles.plainLink}>
                  Prévision
                </Link>
              </div>
              <ul className={styles.alertList}>
                {data.alerts.map((a) => (
                  <li key={`${a.kind}-${a.id}`} className={styles.alertRow}>
                    <span className={styles.alertName}>
                      <Badge tone="neutral">{a.kind === 'account' ? 'Compte' : 'Enveloppe'}</Badge> {a.name}
                    </span>
                    <span className="muted">
                      {formatDateShort(a.firstNegativeDate)} · {inDays(a.daysUntil)}
                    </span>
                    <Amount cents={a.minBalance} size="sm" />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className={styles.columns}>
            <section>
              <div className="section-title">
                <h2>Comptes</h2>
                <Link to="/comptes" className={styles.plainLink}>
                  Gérer
                </Link>
              </div>
              <div className="ledger">
                {data.accounts.map((a) => (
                  <div key={a.id} className={styles.accountRow}>
                    <span className="grow">
                      {a.name}
                      {!a.onBudget ? (
                        <span className="muted" style={{ fontSize: 'var(--text-xs)', marginLeft: 'var(--s-2)' }}>
                          hors budget
                        </span>
                      ) : null}
                    </span>
                    <Amount cents={a.balance} />
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="section-title">
                <h2>Enveloppes</h2>
                <Link to="/enveloppes" className={styles.plainLink}>
                  Gérer
                </Link>
              </div>
              {data.envelopes.length === 0 ? (
                <EmptyState title="Aucune enveloppe" description="Les enveloppes découpent ton argent par thème." action={<Link to="/enveloppes">Créer une enveloppe</Link>} />
              ) : (
                <div className="ledger">
                  {data.envelopes.map((e) => {
                    const ratio = e.monthlyTarget ? e.allocatedThisMonth / e.monthlyTarget : null;
                    return (
                      <div key={e.id} className={styles.envelopeRow}>
                        <div className="spread">
                          <span className={styles.envelopeName}>
                            <Dot color={e.color} /> {e.name}
                          </span>
                          <Amount cents={e.balance} />
                        </div>
                        {ratio !== null ? (
                          <div className={styles.envelopeTarget}>
                            <ProgressBar ratio={ratio} color={e.color} label={`${e.name} : ${Math.round(ratio * 100)} % de l'objectif alloué`} tone={e.balance < 0 ? 'negative' : 'auto'} />
                            <span className="muted">{Math.round(ratio * 100)} % de l'objectif</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <SkeletonRows rows={5} />
      )}

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog === 'allocate' ? 'Allouer de l’argent' : 'Nouvelle opération'}>
        {dialog ? (
          <TransactionForm
            key={dialog}
            kinds={dialog === 'allocate' ? ['allocation'] : undefined}
            submitLabel={dialog === 'allocate' ? 'Allouer' : 'Enregistrer'}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setDialog(null)}
            submitting={create.isPending}
            serverError={create.error ? errorMessage(create.error) : null}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
