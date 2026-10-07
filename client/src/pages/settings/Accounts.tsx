import { Archive, ArchiveRestore, Landmark, Pencil, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { accountInputSchema, type Account, type AccountInput } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useCreateAccount, useOverview, useUpdateAccount } from '@/api/hooks';
import { Amount, Badge, Button, Checkbox, ConfirmDialog, Dialog, DialogFooter, EmptyState, Field, Input, MoneyInput, SkeletonRows, useToast } from '@/components/ui';
import { formatDateLong } from '@/lib/format';
import styles from './Accounts.module.css';

type FormState = { name: string; initialBalance: number | null; onBudget: boolean; bankAccountNumber: string };

function toForm(account?: Account): FormState {
  return {
    name: account?.name ?? '',
    initialBalance: account?.initialBalance ?? 0,
    onBudget: account?.onBudget ?? true,
    bankAccountNumber: account?.bankAccountNumber ?? '',
  };
}

type AccountDialogProps = {
  open: boolean;
  account?: Account;
  onClose: () => void;
};

function AccountDialog({ open, account, onClose }: AccountDialogProps) {
  const toast = useToast();
  const formId = useId();
  const [form, setForm] = useState<FormState>(() => toForm(account));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const create = useCreateAccount({
    onSuccess: () => {
      toast.success('Compte créé');
      onClose();
    },
  });
  const update = useUpdateAccount({
    onSuccess: () => {
      toast.success('Compte modifié');
      onClose();
    },
  });
  const pending = create.isPending || update.isPending;
  const serverError = create.error ?? update.error;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = accountInputSchema.safeParse({
      name: form.name,
      initialBalance: form.initialBalance ?? 0,
      onBudget: form.onBudget,
      bankAccountNumber: form.bankAccountNumber.trim() || null,
    } satisfies AccountInput);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (account) update.mutate({ id: account.id, ...parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onClose={onClose} title={account ? 'Modifier le compte' : 'Nouveau compte'} size="sm">
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <Field label="Nom" error={errors.name}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Compte courant" autoFocus />}
        </Field>
        <Field label="Solde initial" hint="Le solde au moment où tu commences à suivre ce compte." error={errors.initialBalance}>
          {(id, describedBy) => <MoneyInput id={id} aria-describedby={describedBy} value={form.initialBalance} onChange={(c) => set('initialBalance', c)} allowNegative />}
        </Field>
        <Checkbox
          label="Compte d’épargne"
          hint="Livret, assurance vie : son argent reste hors du budget, et ce que tu y verses compte comme mis de côté."
          checked={!form.onBudget}
          onChange={(e) => set('onBudget', !e.target.checked)}
        />
        <Field label="Numéro de compte bancaire" hint="Facultatif. Rempli automatiquement au premier import." error={errors.bankAccountNumber}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} className="mono" spellCheck={false} />}
        </Field>
        {serverError ? (
          <p className={styles.error} role="alert">
            {errorMessage(serverError)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {account ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

type ArchiveDialogProps = { account: Account | null; onClose: () => void };

function ArchiveDialog({ account, onClose }: ArchiveDialogProps) {
  const toast = useToast();
  const update = useUpdateAccount({
    onSuccess: (a) => {
      toast.success(a.archived ? 'Compte archivé' : 'Compte réactivé');
      onClose();
    },
  });
  const archiving = account ? !account.archived : true;
  return (
    <ConfirmDialog
      open={account !== null}
      onClose={onClose}
      onConfirm={() => account && update.mutate({ id: account.id, archived: archiving })}
      title={archiving ? 'Archiver ce compte ?' : 'Réactiver ce compte ?'}
      description={archiving ? 'Le compte disparaît des listes et du total. Ses opérations sont conservées.' : 'Le compte réapparaît dans les listes et le total.'}
      confirmLabel={archiving ? 'Archiver' : 'Réactiver'}
      tone={archiving ? 'danger' : 'primary'}
      loading={update.isPending}
      error={update.error ? errorMessage(update.error) : null}
    >
      {account?.name}
    </ConfirmDialog>
  );
}

export function AccountsSettings() {
  const overview = useOverview();
  const all = useAccounts(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [archiving, setArchiving] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const archived = (all.data ?? []).filter((a) => a.archived);
  const active = overview.data?.accounts ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <p className={styles.total}>
          {overview.data ? (
            <>
              Total <Amount cents={overview.data.netWorth} tone="neutral" />
            </>
          ) : null}
        </p>
        <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
          Nouveau compte
        </Button>
      </div>

      {overview.isPending ? (
        <SkeletonRows rows={3} />
      ) : overview.error ? (
        <p className={styles.error} role="alert">
          {errorMessage(overview.error)}
        </p>
      ) : active.length === 0 ? (
        <EmptyState
          icon={<Landmark />}
          title="Aucun compte"
          description="Commence par créer ton compte courant avec son solde actuel."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
              Créer un compte
            </Button>
          }
        />
      ) : (
        <ul className={['ledger', styles.list].join(' ')}>
          {active.map((a) => (
            <li key={a.id} className={['hover-row', styles.row].join(' ')}>
              <div className={styles.main}>
                <div className={styles.nameLine}>
                  <span className={styles.name}>{a.name}</span>
                  {!a.onBudget ? <Badge>Épargne</Badge> : null}
                </div>
                <div className={styles.meta}>
                  {a.bankAccountNumber ? <span className="mono">{a.bankAccountNumber}</span> : null}
                  {a.lastImport ? <span>Mis à jour le {formatDateLong(a.lastImport.importedAt.slice(0, 10))}</span> : <span>Jamais synchronisé</span>}
                </div>
              </div>
              <Amount cents={a.balance} size="lg" />
              <div className={styles.rowActions}>
                <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setEditing(a)} aria-label={`Modifier ${a.name}`} />
                <Button variant="ghost" size="sm" icon={<Archive />} onClick={() => setArchiving(a)} aria-label={`Archiver ${a.name}`} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className={styles.archived}>
          <button type="button" className={styles.toggle} onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived}>
            {showArchived ? 'Masquer' : 'Afficher'} les comptes archivés ({archived.length})
          </button>
          {showArchived ? (
            <ul className={['ledger', styles.list].join(' ')}>
              {archived.map((a) => (
                <li key={a.id} className={[styles.row, styles.rowArchived].join(' ')}>
                  <div className={styles.main}>
                    <div className={styles.nameLine}>
                      <span className={styles.name}>{a.name}</span>
                      <Badge>Archivé</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<ArchiveRestore />} onClick={() => setArchiving(a)}>
                    Réactiver
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {creating ? <AccountDialog open onClose={() => setCreating(false)} /> : null}
      {editing ? <AccountDialog key={editing.id} open account={editing} onClose={() => setEditing(null)} /> : null}
      <ArchiveDialog account={archiving} onClose={() => setArchiving(null)} />
    </div>
  );
}
