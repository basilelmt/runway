import { AlertTriangle, ArrowRight, Check, Clock, Inbox, Landmark, RefreshCw, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Overview } from '@shared/api-types';
import { daysBetween, formatDateShort } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useIsMutating } from '@tanstack/react-query';
import { keys, useBankSync, useOverview } from '@/api/hooks';
import { FundingBanner } from '@/components/budget/FundingBanner';
import { SignalsSection } from '@/components/home/SignalsSection';
import {
  Amount,
  Badge,
  ButtonLink,
  EmptyState,
  ErrorState,
  KeyFigure,
  ListRowSkeleton,
  ProgressBar,
  SectionHeader,
  Skeleton,
  Stat,
  StatGroup,
  TodoItem,
  Total,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { bankSyncTodo } from '@/lib/bank';
import { budgetOverIncome, monthProgress, watchTodo } from '@/lib/budget';
import { plural } from '@/lib/format';
import styles from './Home.module.css';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (iso: string) => capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));
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

      {data.latestFunding ? <FundingBanner funding={data.latestFunding} budgetLink /> : null}
      <MonthHero data={data} />
      <TodoList data={data} />
      <SignalsSection />
      <AccountsStrip data={data} />
    </div>
  );
}

function MonthHero({ data }: { data: Overview }) {
  const { spent, budget, saved, variable } = data.month;
  const progress = monthProgress(data.today, data.month.end);
  // Le rythme ne vaut que pour les dépenses courantes : le loyer tombe en début de mois, pas au fil des jours.
  const pace = Math.round(variable.budget * progress) - variable.spent;

  return (
    <KeyFigure
      label="Dépensé ce mois-ci"
      figure={<Amount cents={spent} size="xl" tone="neutral" animate />}
      context={budget > 0 ? `sur ${formatEuros(budget)} prévus` : undefined}
      caption={
        budget > 0 ? (
          variable.budget > 0 ? (
            <>
              <strong className={['num', pace < 0 ? styles.paceOver : styles.paceUnder].join(' ')}>{formatEuros(Math.abs(pace))}</strong> {pace >= 0 ? 'sous le' : 'au-dessus du'} rythme du
              mois pour les dépenses courantes. Le trait marque aujourd’hui.
            </>
          ) : undefined
        ) : (
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
    >
      {budget > 0 ? (
        <>
          <ProgressBar ratio={spent / budget} size="md" color="var(--ink)" label={`${formatEuros(spent)} dépensés sur un budget de ${formatEuros(budget)}`} />
          {variable.budget > 0 ? (
            <div className={styles.variable}>
              <div className={styles.variableHead}>
                <span>
                  Dépenses courantes <span className={[styles.muted, styles.nowrap].join(' ')}>hors charges fixes</span>
                </span>
                <span className={['num', styles.nowrap].join(' ')}>
                  {formatEuros(variable.spent)} <span className={styles.muted}>/ {formatEuros(variable.budget)}</span>
                </span>
              </div>
              <ProgressBar
                ratio={variable.spent / variable.budget}
                color="var(--ink-soft)"
                label={`Dépenses courantes : ${formatEuros(variable.spent)} sur ${formatEuros(variable.budget)}`}
                marker={progress}
                markerLabel="Aujourd’hui"
              />
            </div>
          ) : null}
        </>
      ) : null}
    </KeyFigure>
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
        <EmptyState icon={<Check />} title="Rien à faire" description="Tout est rangé et la piste est dégagée." />
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

function AccountsStrip({ data }: { data: Overview }) {
  return (
    <section aria-labelledby="accounts-title" className={styles.accounts}>
      <SectionHeader id="accounts-title" title="Comptes" aside={<Total cents={data.netWorth} />} />
      <ul className={styles.accountList}>
        {data.accounts.map((a) => (
          <li key={a.id} className={styles.account}>
            <span className={styles.accountName}>
              {a.name}
              {!a.onBudget ? <Badge>Épargne</Badge> : null}
            </span>
            <Amount cents={a.balance} size="lg" />
          </li>
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
