import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Clock, Inbox, Landmark, RefreshCw, WalletCards } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Overview } from '@shared/api-types';
import type { Transaction } from '@shared/schemas';
import { daysBetween, formatDateShort } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useIsMutating } from '@tanstack/react-query';
import { keys, useAccounts, useBankSync, useEnvelopes, useOverview, useTransactions } from '@/api/hooks';
import { FundingBanner } from '@/components/budget/FundingBanner';
import { BackupBanner } from '@/components/dashboard/BackupBanner';
import { MonthPaceChart } from '@/components/home/MonthPaceChart';
import { SignalsSection } from '@/components/home/SignalsSection';
import { TransactionEditDialog } from '@/components/transactions/TransactionEditDialog';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import {
  Amount,
  ButtonLink,
  EmptyState,
  ErrorState,
  KeyFigure,
  ListRow,
  ListRowSkeleton,
  listRowDate,
  Notice,
  SectionHeader,
  SectionLink,
  Skeleton,
  Stat,
  StatGroup,
  TodoItem,
  Total,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { bankSyncTodo } from '@/lib/bank';
import { budgetOverIncome, watchTodo } from '@/lib/budget';
import { formatDateCompact, plural } from '@/lib/format';
import styles from './Home.module.css';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** En minuscule, comme tout mois dans une phrase en français (« bilan de septembre »). */
const monthNameLower = (iso: string) => new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
/** En capitale initiale, pour un titre seul (« Octobre »). */
const monthName = (iso: string) => capitalize(monthNameLower(iso));
const longDay = (iso: string) =>
  capitalize(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));

export function HomePage() {
  const overview = useOverview();

  if (overview.isError) {
    return (
      <div className="page">
        <ErrorState title="Impossible de charger l’accueil" description={errorMessage(overview.error)} onRetry={() => overview.refetch()} />
      </div>
    );
  }

  const data = overview.data;
  if (!data) return <HomeSkeleton />;

  if (data.accounts.length === 0) {
    return (
      <div className="page">
        <EmptyState
          icon={<Landmark />}
          title="Bienvenue sur Runway"
          description="Commence par ton compte courant et son solde actuel. Tu découperas ensuite ton budget en enveloppes."
          action={
            <ButtonLink to="/reglages/comptes" variant="primary" icon={<ArrowRight />}>
              Créer un compte
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const daysLeft = daysBetween(data.today, data.month.end);

  return (
    <div className="page">
      <PageHeader
        eyebrow={longDay(data.today)}
        title={monthName(data.today)}
        subtitle={daysLeft === 0 ? 'Dernier jour du mois' : `Encore ${plural(daysLeft, 'jour')} ce mois-ci`}
      />

      <BackupBanner />
      {data.latestFunding ? <FundingBanner funding={data.latestFunding} budgetLink /> : null}
      {data.pendingReview ? <PendingReviewBanner pendingReview={data.pendingReview} /> : null}
      <MonthHero data={data} />
      <TodoList data={data} />
      <SignalsSection />
      <div className={styles.columns}>
        <RecentOperations />
        <AccountsList data={data} />
      </div>
    </div>
  );
}

/** Invite au bilan du mois précédent, tant qu'il n'est pas validé : pas de bouton pour la masquer, elle disparaît seule. */
function PendingReviewBanner({ pendingReview }: { pendingReview: NonNullable<Overview['pendingReview']> }) {
  return (
    <Notice
      tone="marking"
      icon={<ClipboardCheck />}
      label="Bilan du mois précédent"
      action={
        <ButtonLink to={`/analyse?vue=bilan&mois=${pendingReview.month}`} size="sm" variant="primary">
          Faire le bilan
        </ButtonLink>
      }
    >
      Bilan de {monthNameLower(`${pendingReview.month}-01`)} :{' '}
      {pendingReview.overspentCount > 0 ? (
        <>
          {formatEuros(pendingReview.spent)} dépensés, {plural(pendingReview.overspentCount, 'enveloppe dépassée', 'enveloppes dépassées')}
        </>
      ) : (
        <>{formatEuros(pendingReview.spent)} dépensés</>
      )}
    </Notice>
  );
}

function MonthHero({ data }: { data: Overview }) {
  const { spent, budget, saved, variable } = data.month;
  // Le rythme ne vaut que pour les dépenses courantes : le loyer tombe en début de mois, pas au fil des jours.
  const chart = budget > 0 && variable.budget > 0;

  return (
    <KeyFigure
      label="Dépensé ce mois-ci"
      figure={<Amount cents={spent} size="xl" tone="neutral" animate />}
      context={budget > 0 ? `sur ${formatEuros(budget)} prévus` : undefined}
      chart={chart ? <MonthPaceChart daily={variable.daily} budget={variable.budget} monthStart={data.month.start} monthEnd={data.month.end} /> : undefined}
      caption={
        budget > 0 ? undefined : (
          <>
            Aucun budget mensuel pour l’instant. <Link to="/budget">Fixe un budget à tes enveloppes</Link> pour suivre ton rythme.
          </>
        )
      }
      aside={
        <StatGroup direction="column" divided>
          <Stat label="Mis de côté">
            <Amount cents={saved} size="lg" tone="neutral" className={saved > 0 ? styles.positive : saved < 0 ? styles.negative : ''} animate />
          </Stat>
        </StatGroup>
      }
    />
  );
}

type Todo = { key: string; to: string; icon: ReactNode; text: ReactNode; tone?: 'alert' };

function TodoList({ data }: { data: Overview }) {
  const bank = useBankSync();
  // Pendant la synchronisation automatique de l'ouverture, le retard est peut-être en train d'être rattrapé.
  const syncing = useIsMutating({ mutationKey: keys.bankSyncRun }) > 0;
  const todos: Todo[] = [];
  const sync = bank.data && !syncing ? bankSyncTodo(bank.data, new Date()) : null;
  if (sync) {
    todos.push({ key: 'sync', to: '/reglages/banque', icon: <RefreshCw />, tone: sync.tone === 'alert' ? 'alert' : undefined, text: <>{sync.text}</> });
  }
  if (data.unsortedCount > 0) {
    todos.push({ key: 'unsorted', to: '/operations?vue=a-ranger', icon: <Inbox />, text: <>{plural(data.unsortedCount, 'opération à ranger', 'opérations à ranger')} dans une enveloppe</> });
  }
  if (data.toAllocate < 0) {
    todos.push({
      key: 'over',
      to: '/budget',
      icon: <WalletCards />,
      tone: 'alert',
      text: <>Tu as réparti {formatEuros(-data.toAllocate)} de plus que ce que tes comptes contiennent</>,
    });
  } else if (data.toAllocate > 0 && data.month.toFund > 0) {
    todos.push({
      key: 'fund',
      to: '/budget?repartir=1',
      icon: <WalletCards />,
      text: <>{formatEuros(Math.min(data.toAllocate, data.month.toFund))} à répartir pour compléter le budget du mois</>,
    });
  }
  const overIncome = budgetOverIncome(data.month);
  if (overIncome > 0) {
    todos.push({
      key: 'income',
      to: '/budget',
      icon: <WalletCards />,
      tone: 'alert',
      text: (
        <>
          Tes enveloppes prévoient {formatEuros(overIncome)} de plus que ton revenu{' '}
          <span className={styles.todoDetail}>
            · <span className={styles.nowrap}>{formatEuros(data.month.planned)}</span> pour <span className={styles.nowrap}>{formatEuros(data.month.income)}</span> par mois
          </span>
        </>
      ),
    });
  }
  const watch = watchTodo(data.watch);
  if (watch) {
    todos.push({
      key: 'watch',
      to: '/budget',
      icon: <WalletCards />,
      tone: watch.tone,
      text: (
        <>
          {watch.text}
          {watch.detail ? (
            <>
              {' '}
              <span className={styles.todoDetail}>· {watch.detail}</span>
            </>
          ) : null}
        </>
      ),
    });
  }
  // Une enveloppe déjà signalée dépassée dans la ligne de surveillance ne doit pas aussi sortir une alerte de prévision.
  const overWatched = new Set(data.watch.filter((w) => w.kind === 'over').map((w) => w.envelopeId));
  const alert = data.alerts.find((a) => a.kind !== 'envelope' || !overWatched.has(a.id));
  if (alert) {
    todos.push({
      key: 'alert',
      to: '/analyse?vue=a-venir',
      icon: <AlertTriangle />,
      tone: 'alert',
      text: (
        <>
          {alert.kind === 'account' ? 'Le compte' : 'L’enveloppe'} {alert.name} passe dans le rouge {alert.daysUntil <= 0 ? 'dès aujourd’hui' : `le ${formatDateShort(alert.firstNegativeDate)}`}{' '}
          <span className={styles.todoDetail}>· point bas {formatEuros(alert.minBalance)}</span>
        </>
      ),
    });
  }
  const late = data.latePlanned;
  const first = late[0];
  if (first) {
    todos.push({
      key: 'planned',
      to: '/operations?status=planned&period=all',
      icon: <Clock />,
      text:
        late.length === 1 ? (
          <>
            {first.kind === 'income' ? 'Le revenu' : first.kind === 'transfer' ? 'Le virement' : 'Le prélèvement'} « {first.label} » de {formatEuros(first.amount)} prévu le {formatDateShort(first.date)} n’est pas passé{' '}
            <span className={styles.todoDetail}>· confirme-le ou supprime-le</span>
          </>
        ) : (
          <>
            {late.length} opérations prévues ne sont pas passées{' '}
            <span className={styles.todoDetail}>· confirme-les ou supprime-les</span>
          </>
        ),
    });
  }

  return (
    <section aria-labelledby="todo-title">
      <SectionHeader id="todo-title" title="À faire" />
      {todos.length === 0 ? (
        <EmptyState layout="inline" icon={<Check />} title="Rien à faire" description="Tout est rangé et la piste est dégagée." />
      ) : (
        <ul className={[styles.todos, 'stagger'].join(' ')}>
          {todos.map((t) => (
            <li key={t.key}>
              <TodoItem to={t.to} icon={t.icon} tone={t.tone === 'alert' ? 'negative' : 'marking'}>
                {t.text}
              </TodoItem>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RECENT_COUNT = 5;

/** Les dernières opérations passées sur les comptes, comme dans Opérations, pour sentir le mois sans quitter l'Accueil. */
function RecentOperations() {
  const transactions = useTransactions({ status: 'confirmed', excludeAllocations: true, limit: RECENT_COUNT });
  const accounts = useAccounts(true);
  const envelopes = useEnvelopes(true);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const accountMap = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const envelopeMap = useMemo(() => new Map((envelopes.data ?? []).map((e) => [e.id, e])), [envelopes.data]);
  const error = transactions.error ?? accounts.error ?? envelopes.error;
  const list = transactions.data;

  return (
    <section aria-labelledby="recent-title">
      <SectionHeader id="recent-title" title="Dernières opérations" aside={<SectionLink to="/operations">Tout voir</SectionLink>} />
      {error ? (
        <ErrorState title="Impossible de charger les opérations" description={errorMessage(error)} onRetry={() => void Promise.all([transactions.refetch(), accounts.refetch(), envelopes.refetch()])} />
      ) : !list || !accounts.data || !envelopes.data ? (
        <ListRowSkeleton rows={RECENT_COUNT} />
      ) : list.length === 0 ? (
        <EmptyState layout="inline" title="Aucune opération" description="Elles arriveront avec la synchro ou un import." />
      ) : (
        <ul className="ledger">
          {list.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              accounts={accountMap}
              envelopes={envelopeMap}
              onClick={() => setEditing(t)}
              lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}
            />
          ))}
        </ul>
      )}
      <TransactionEditDialog transaction={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function AccountsList({ data }: { data: Overview }) {
  return (
    <section aria-labelledby="accounts-title">
      <SectionHeader id="accounts-title" title="Comptes" aside={<Total cents={data.netWorth} />} />
      <ul className="ledger">
        {data.accounts.map((a) => (
          <ListRow
            key={a.id}
            title={
              <>
                {a.name}
                {!a.onBudget ? <span className={styles.accountKind}>Épargne</span> : null}
              </>
            }
            trail={<Amount cents={a.balance} />}
          />
        ))}
      </ul>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="page" aria-busy>
      <div className="stack">
        <Skeleton width={140} height={14} />
        <Skeleton width={220} height={36} />
      </div>
      <div className="stack">
        <Skeleton width={120} height={12} />
        <Skeleton width={280} height={68} />
        <Skeleton height={10} />
      </div>
      <ListRowSkeleton rows={3} meta={false} />
    </div>
  );
}
