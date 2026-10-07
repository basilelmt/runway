import { Archive, ArchiveRestore, ArrowRightLeft, GripVertical, Pencil, Plus, WalletCards } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { EnvelopeWithBalance, Overview } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useEnvelopes, useOverview, useReorderEnvelopes, useUpdateEnvelope } from '@/api/hooks';
import { EnvelopeDetailDialog } from '@/components/budget/EnvelopeDetailDialog';
import { EnvelopeRow, EnvelopeRowHeader } from '@/components/budget/EnvelopeRow';
import { FixedCharges } from '@/components/budget/FixedCharges';
import { FundDialog } from '@/components/budget/FundDialog';
import { AllocateDialog } from '@/components/envelopes/AllocateDialog';
import { EnvelopeFormDialog } from '@/components/envelopes/EnvelopeFormDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Amount, Button, Dialog, Dot, EmptyState, Skeleton, useToast } from '@/components/ui';
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
  const [menuFor, setMenuFor] = useState<EnvelopeWithBalance | null>(null);
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
    onError: (e) => toast.error(errorMessage(e)),
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

  function onHandleKey(e: KeyboardEvent, id: number) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(id, e.key === 'ArrowUp' ? -1 : 1);
    }
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
          className={[styles.dragRow, dragId === env.id ? styles.dragging : '', overId === env.id && dragId !== env.id ? styles.dragOver : ''].join(' ')}
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
            onMore={() => setMenuFor(env)}
            onOpen={() => setDetail(env)}
            leading={
              <button type="button" className={styles.handle} aria-label={`Déplacer ${env.name} dans la liste (flèches haut et bas)`} onKeyDown={(e) => onHandleKey(e, env.id)}>
                <GripVertical aria-hidden />
              </button>
            }
            actions={
              <>
                <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setAlloc({ mode: 'allocate', envelope: env })} aria-label={`Ajouter de l’argent à ${env.name}`} title="Ajouter de l’argent" />
                <Button variant="ghost" size="sm" icon={<ArrowRightLeft />} onClick={() => setAlloc({ mode: 'move', envelope: env })} aria-label={`Déplacer de l’argent depuis ${env.name}`} title="Déplacer vers une autre enveloppe" />
                <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setEditing(env)} aria-label={`Modifier ${env.name}`} title="Modifier" />
                <Button variant="ghost" size="sm" icon={<Archive />} onClick={() => setArchiving(env)} aria-label={`Archiver ${env.name}`} title="Archiver" />
              </>
            }
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

      <section className={styles.unallocated} aria-label="Pas encore réparti">
        <div className={styles.unallocatedFigure}>
          <p className="eyebrow">Pas encore réparti</p>
          {data ? <Amount cents={data.toAllocate} size="xl" tone="neutral" className={data.toAllocate < 0 ? styles.negative : ''} animate /> : <Skeleton width={220} height={64} />}
        </div>
        <div className={styles.unallocatedSide}>
          <p className={styles.hint}>
            {!data
              ? ' '
              : data.toAllocate < 0
                ? 'Tu as réparti plus que ce que tes comptes contiennent. Retire de l’argent d’une enveloppe pour revenir à zéro.'
                : data.month.toFund > 0
                  ? `Il manque ${formatEuros(data.month.toFund)} à tes enveloppes pour atteindre le budget du mois.`
                  : 'Toutes tes enveloppes ont leur budget du mois. Le reste peut aller à l’épargne.'}
          </p>
          <Button variant="marking" icon={<WalletCards />} onClick={() => setFunding(true)} disabled={!data || order.length === 0}>
            Répartir
          </Button>
        </div>
      </section>

      {data ? <IncomePlan month={data.month} /> : null}

      {overview.isPending ? (
        <div className="stack">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={52} />
          ))}
        </div>
      ) : overview.error ? (
        <p className={styles.error} role="alert">
          {errorMessage(overview.error)}
        </p>
      ) : order.length === 0 ? (
        <EmptyState
          icon={<WalletCards />}
          title="Crée ta première enveloppe"
          description="Courses, Loyer, Sorties, Voyages : chaque enveloppe réserve une part de ton argent à un usage, avec un budget par mois."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
              Créer une enveloppe
            </Button>
          }
        />
      ) : (
        <>
          <section aria-labelledby="spending-title">
            <div className="section-title">
              <h2 id="spending-title">Dépenses</h2>
            </div>
            {spending.length > 0 ? rows(spending, 'Dépensé ce mois') : <p className={styles.hint}>Aucune enveloppe de dépenses.</p>}
          </section>

          <section aria-labelledby="savings-title">
            <div className="section-title">
              <h2 id="savings-title">Épargne</h2>
              {data ? (
                <span className={styles.savedLine}>
                  Mis de côté ce mois <Amount cents={data.month.saved} tone="neutral" />
                </span>
              ) : null}
            </div>
            {savings.length > 0 ? (
              rows(savings, 'Versé ce mois')
            ) : (
              <p className={styles.hint}>Marque une enveloppe comme « épargne » (bouton Modifier) pour suivre ce que tu mets de côté et investis. Les virements vers tes livrets comptent déjà.</p>
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
      <Dialog open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ''} size="sm">
        {menuFor ? (
          <ul className={styles.sheet}>
            {[
              { label: 'Ajouter de l’argent', icon: <Plus />, run: () => setAlloc({ mode: 'allocate', envelope: menuFor }) },
              { label: 'Déplacer vers une autre enveloppe', icon: <ArrowRightLeft />, run: () => setAlloc({ mode: 'move', envelope: menuFor }) },
              { label: 'Modifier', icon: <Pencil />, run: () => setEditing(menuFor) },
              { label: 'Archiver', icon: <Archive />, run: () => setArchiving(menuFor) },
            ].map((a) => (
              <li key={a.label}>
                <button
                  type="button"
                  className={styles.sheetItem}
                  onClick={() => {
                    setMenuFor(null);
                    a.run();
                  }}
                >
                  {a.icon}
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>
      <EnvelopeDetailDialog envelope={detail} onClose={() => setDetail(null)} />
      {creating ? <EnvelopeFormDialog open onClose={() => setCreating(false)} /> : null}
      {editing ? <EnvelopeFormDialog key={editing.id} open envelope={editing} onClose={() => setEditing(null)} /> : null}
      <Dialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title="Archiver cette enveloppe ?"
        description="Elle disparaît du budget et son solde revient dans « Pas encore réparti ». Les dépenses déjà rangées dedans sont conservées."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={archive.isPending} onClick={() => archiving && archive.mutate({ id: archiving.id, archived: true })}>
              Archiver
            </Button>
          </>
        }
      >
        <p className={styles.dialogName}>
          {archiving ? <Dot color={archiving.color} /> : null} {archiving?.name}
        </p>
        {archiving && archiving.balance !== 0 ? (
          <p className={styles.hint}>
            Solde actuel : <Amount cents={archiving.balance} size="sm" />
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

function ArchivedEnvelopes() {
  const toast = useToast();
  const all = useEnvelopes(true);
  const [open, setOpen] = useState(false);
  const restore = useUpdateEnvelope({ onSuccess: (e) => toast.success(`${e.name} réactivée`), onError: (e) => toast.error(errorMessage(e)) });
  const archived = (all.data ?? []).filter((e) => e.archived);
  if (archived.length === 0) return null;

  return (
    <section className={styles.archived}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Masquer' : 'Afficher'} les enveloppes archivées ({archived.length})
      </button>
      {open ? (
        <ul className="ledger">
          {archived.map((e) => (
            <li key={e.id} className={styles.archivedRow}>
              <span className={styles.archivedName}>
                <Dot color={e.color} /> {e.name}
              </span>
              <Button variant="ghost" size="sm" icon={<ArchiveRestore />} loading={restore.isPending && restore.variables?.id === e.id} onClick={() => restore.mutate({ id: e.id, archived: false })}>
                Réactiver
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Compare ce que les enveloppes prévoient chaque mois au revenu récurrent attendu. */
function IncomePlan({ month }: { month: Overview['month'] }) {
  if (month.income <= 0 || month.planned <= 0) return null;
  const over = budgetOverIncome(month);
  return (
    <p className={[styles.plan, over > 0 ? styles.planOver : ''].join(' ')}>
      Tes enveloppes prévoient <strong className="num">{formatEuros(month.planned)}</strong> par mois pour <strong className="num">{formatEuros(month.income)}</strong> de revenu
      {over > 0 ? (
        <>
          {' '}: <strong className={['num', styles.negative].join(' ')}>{formatEuros(over)} de trop</strong>. Baisse quelques budgets pour rester dans ton revenu.
        </>
      ) : (
        <>, il reste {formatEuros(month.income - month.planned)}.</>
      )}
    </p>
  );
}
