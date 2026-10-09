import { Archive, ArchiveRestore, ArrowRightLeft, Pencil, Plus, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { EnvelopeWithBalance, Overview } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useEnvelopes, useOverview, useReorderEnvelopes, useUpdateEnvelope } from '@/api/hooks';
import { EnvelopeDetailDialog } from '@/components/budget/EnvelopeDetailDialog';
import { EnvelopeRow, EnvelopeRowHeader } from '@/components/budget/EnvelopeRow';
import { FixedCharges } from '@/components/budget/FixedCharges';
import { FundDialog } from '@/components/budget/FundDialog';
import { FundingBanner } from '@/components/budget/FundingBanner';
import { AllocateDialog } from '@/components/envelopes/AllocateDialog';
import { EnvelopeFormDialog } from '@/components/envelopes/EnvelopeFormDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Amount, Button, ConfirmDialog, Disclosure, Dot, DragHandle, dragRow, EmptyState, ErrorState, KeyFigure, ListRow, ListRowSkeleton, Notice, SectionHeader, Skeleton, Total, useToast } from '@/components/ui';
import { budgetOverIncome } from '@/lib/budget';
import styles from './Budget.module.css';

type AllocState = { mode: 'allocate' | 'move'; envelope: EnvelopeWithBalance } | null;

const monthLabel = (iso: string) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function BudgetPage() {
  const overview = useOverview();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [order, setOrder] = useState<EnvelopeWithBalance[]>([]);
  const [source, setSource] = useState<EnvelopeWithBalance[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [alloc, setAlloc] = useState<AllocState>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EnvelopeWithBalance | null>(null);
  const [archiving, setArchiving] = useState<EnvelopeWithBalance | null>(null);
  const [detail, setDetail] = useState<EnvelopeWithBalance | null>(null);

  const funding = params.get('repartir') === '1';
  const setFunding = (open: boolean) =>
    setParams(
      (p) => {
        if (open) p.set('repartir', '1');
        else p.delete('repartir');
        return p;
      },
      { replace: true },
    );

  const reorder = useReorderEnvelopes({ onError: (e) => toast.error(errorMessage(e)) });
  const archive = useUpdateEnvelope({
    onSuccess: () => {
      toast.success('Enveloppe archivée');
      setArchiving(null);
    },
  });

  // Copie locale pour un réordonnancement optimiste, resynchronisée quand le serveur répond.
  if (overview.data && overview.data.envelopes !== source) {
    setSource(overview.data.envelopes);
    setOrder(overview.data.envelopes);
  }

  function move(id: number, delta: number) {
    const from = order.findIndex((e) => e.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setOrder(next);
    reorder.mutate(next.map((e) => e.id));
  }

  function drop(targetId: number) {
    if (dragId === null) return;
    move(dragId, order.findIndex((e) => e.id === targetId) - order.findIndex((e) => e.id === dragId));
    setDragId(null);
    setOverId(null);
  }

  const data = overview.data;
  const spending = order.filter((e) => !e.isSavings);
  const savings = order.filter((e) => e.isSavings);

  const rows = (list: EnvelopeWithBalance[], spentLabel: string) => (
    <>
      <EnvelopeRowHeader withActions spentLabel={spentLabel} />
      <div className="ledger stagger">
        {list.map((env) => (
          <div
            key={env.id}
            className={[dragRow.row, dragId === env.id ? dragRow.dragging : '', overId === env.id && dragId !== env.id ? dragRow.over : ''].join(' ')}
            draggable
            onDragStart={(e) => {
              setDragId(env.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== env.id) setOverId(env.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(env.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
          >
            <EnvelopeRow
              envelope={env}
              onOpen={() => setDetail(env)}
              leading={<DragHandle label={`Déplacer ${env.name} dans la liste (flèches haut et bas)`} onMove={(delta) => move(env.id, delta)} />}
              menu={[
                { label: 'Ajouter de l’argent', icon: <Plus />, onSelect: () => setAlloc({ mode: 'allocate', envelope: env }) },
                { label: 'Déplacer vers une autre enveloppe', icon: <ArrowRightLeft />, onSelect: () => setAlloc({ mode: 'move', envelope: env }) },
                { label: 'Modifier', icon: <Pencil />, onSelect: () => setEditing(env) },
                { label: 'Archiver', icon: <Archive />, onSelect: () => setArchiving(env), danger: true },
              ]}
            />
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="page">
      <PageHeader
        title="Budget"
        subtitle={data ? `Ton argent découpé en enveloppes, ${monthLabel(data.today)}.` : undefined}
        actions={
          <Button icon={<Plus />} onClick={() => setCreating(true)}>
            Nouvelle enveloppe
          </Button>
        }
      />

      {data?.latestFunding ? <FundingBanner funding={data.latestFunding} /> : null}

      <KeyFigure
        label="Pas encore réparti"
        figure={data ? <Amount cents={data.toAllocate} size="xl" tone="neutral" className={data.toAllocate < 0 ? styles.negative : ''} animate /> : <Skeleton width={220} height={68} />}
        caption={
          !data
            ? undefined
            : data.toAllocate < 0
              ? 'Tu as réparti plus que ce que tes comptes contiennent. Retire de l’argent d’une enveloppe pour revenir à zéro.'
              : data.month.toFund > 0
                ? `Il manque ${formatEuros(data.month.toFund)} à tes enveloppes pour atteindre le budget du mois.`
                : 'Toutes tes enveloppes ont leur budget du mois. Le reste peut aller à l’épargne.'
        }
        aside={
          <Button variant="marking" icon={<WalletCards />} onClick={() => setFunding(true)} disabled={!data || order.length === 0}>
            Répartir
          </Button>
        }
      />

      {data ? <IncomePlan month={data.month} /> : null}

      {overview.isPending ? (
        <ListRowSkeleton rows={6} meta={false} middle actions />
      ) : overview.error ? (
        <ErrorState title="Impossible de charger le budget" description={errorMessage(overview.error)} onRetry={() => overview.refetch()} />
      ) : order.length === 0 ? (
        <EmptyState
          icon={<WalletCards />}
          title="Crée ta première enveloppe"
          description="Courses, Loyer, Sorties, Voyages : chaque enveloppe réserve une part de ton argent à un usage, avec un budget par mois."
          action={
            <Button icon={<Plus />} onClick={() => setCreating(true)}>
              Créer une enveloppe
            </Button>
          }
        />
      ) : (
        <>
          <section aria-labelledby="spending-title">
            <SectionHeader id="spending-title" title="Dépenses" />
            {spending.length > 0 ? rows(spending, 'Dépensé ce mois') : <p className={styles.hint}>Aucune enveloppe de dépenses.</p>}
          </section>

          <section aria-labelledby="savings-title">
            <SectionHeader id="savings-title" title="Épargne" aside={data ? <Total label="Mis de côté ce mois" cents={data.month.saved} /> : undefined} />
            {savings.length > 0 ? (
              rows(savings, 'Versé ce mois')
            ) : (
              <p className={styles.hint}>Marque une enveloppe comme « épargne » (menu ⋯ puis Modifier) pour suivre ce que tu mets de côté et investis. Les virements vers tes livrets comptent déjà.</p>
            )}
          </section>
        </>
      )}

      <FixedCharges />

      <ArchivedEnvelopes />

      {data ? <FundDialog open={funding} onClose={() => setFunding(false)} envelopes={data.envelopes} toAllocate={data.toAllocate} /> : null}
      <AllocateDialog
        open={alloc !== null}
        onClose={() => setAlloc(null)}
        envelopeId={alloc?.mode === 'allocate' ? alloc.envelope.id : null}
        fromEnvelopeId={alloc?.mode === 'move' ? alloc.envelope.id : null}
        envelopeName={alloc?.envelope.name}
      />
      <EnvelopeDetailDialog envelope={detail} onClose={() => setDetail(null)} />
      {creating ? <EnvelopeFormDialog open onClose={() => setCreating(false)} /> : null}
      {editing ? <EnvelopeFormDialog key={editing.id} open envelope={editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={archiving !== null}
        onClose={() => {
          setArchiving(null);
          archive.reset();
        }}
        onConfirm={() => archiving && archive.mutate({ id: archiving.id, archived: true })}
        title="Archiver cette enveloppe ?"
        description="Elle disparaît du budget et son solde revient dans « Pas encore réparti ». Les dépenses déjà rangées dedans sont conservées."
        confirmLabel="Archiver"
        loading={archive.isPending}
        error={archive.error ? errorMessage(archive.error) : null}
      >
        {archiving ? (
          <>
            <Dot color={archiving.color} /> {archiving.name}
            {archiving.balance !== 0 ? (
              <span className={styles.archiveBalance}>
                Solde actuel : <Amount cents={archiving.balance} size="sm" />
              </span>
            ) : null}
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function ArchivedEnvelopes() {
  const toast = useToast();
  const all = useEnvelopes(true);
  const restore = useUpdateEnvelope({ onSuccess: (e) => toast.success(`${e.name} réactivée`), onError: (e) => toast.error(errorMessage(e)) });
  const archived = (all.data ?? []).filter((e) => e.archived);
  if (archived.length === 0) return null;

  return (
    <Disclosure label="Afficher les enveloppes archivées" openLabel="Masquer les enveloppes archivées" count={archived.length}>
      <ul className="ledger">
        {archived.map((e) => (
          <ListRow
            key={e.id}
            compact
            lead={<Dot color={e.color} />}
            title={e.name}
            actions={
              <Button variant="ghost" size="sm" icon={<ArchiveRestore />} loading={restore.isPending && restore.variables?.id === e.id} onClick={() => restore.mutate({ id: e.id, archived: false })}>
                Réactiver
              </Button>
            }
          />
        ))}
      </ul>
    </Disclosure>
  );
}

/** Compare ce que les enveloppes prévoient chaque mois au revenu récurrent attendu. */
function IncomePlan({ month }: { month: Overview['month'] }) {
  if (month.income <= 0 || month.planned <= 0) return null;
  const over = budgetOverIncome(month);
  const text = (
    <>
      Tes enveloppes prévoient <strong className="num">{formatEuros(month.planned)}</strong> par mois pour <strong className="num">{formatEuros(month.income)}</strong> de revenu
      {over > 0 ? (
        <>
          {' '}: <strong className="num">{formatEuros(over)} de trop</strong>. Baisse quelques budgets pour rester dans ton revenu.
        </>
      ) : (
        <>, il reste {formatEuros(month.income - month.planned)}.</>
      )}
    </>
  );
  return over > 0 ? <Notice tone="negative">{text}</Notice> : <p className={styles.plan}>{text}</p>;
}
