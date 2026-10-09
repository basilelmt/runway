import { ArrowRight, Landmark, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { BankConnectionView } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { Account } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useBankSync,
  useCompleteBankConnection,
  useDisconnectBank,
  useLinkBankAccounts,
  useRunBankSync,
  useStartBankConnection,
} from '@/api/hooks';
import { Badge, Button, ConfirmDialog, FieldError, Input, Notice, Select, SkeletonRows, useToast } from '@/components/ui';
import { formatDateLong, formatDateTime, plural, syncSummary } from '@/lib/format';
import styles from './BankSyncPanel.module.css';

const EXPIRY_WARNING_DAYS = 15;

/** Extrait `code` et `state` de l'URL de retour collée (ou d'une simple query string). */
function parseReturn(text: string): { code: string; state: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let params: URLSearchParams;
  try {
    params = new URL(trimmed).searchParams;
  } catch {
    params = new URLSearchParams(trimmed.replace(/^\?/, ''));
  }
  const code = params.get('code');
  const state = params.get('state');
  return code && state ? { code, state } : null;
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const STATUS_LABEL: Record<BankConnectionView['status'], { label: string; tone: 'positive' | 'warning' | 'negative' | 'neutral' }> = {
  pending: { label: 'En attente', tone: 'neutral' },
  authorized: { label: 'Comptes à associer', tone: 'warning' },
  active: { label: 'Connectée', tone: 'positive' },
  expired: { label: 'Consentement expiré', tone: 'negative' },
  revoked: { label: 'Déconnectée', tone: 'neutral' },
};

type Auth = { connectionId: number; url: string };

export function BankSyncPanel() {
  const toast = useToast();
  const state = useBankSync();
  const accounts = useAccounts();
  const [auth, setAuth] = useState<Auth | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<number | null>(null);

  const start = useStartBankConnection({
    onSuccess: (a) => {
      setAuth(a);
      setPasted('');
      setPasteError(null);
      window.open(a.url, '_blank', 'noopener');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const complete = useCompleteBankConnection({
    onSuccess: () => {
      setAuth(null);
      toast.success('Banque connectée');
    },
    onError: (e) => setPasteError(errorMessage(e)),
  });
  const run = useRunBankSync({
    onSuccess: (r) => {
      const summary = syncSummary(r);
      const failed = r.connections.find((c) => c.error);
      // Échec partiel : ce qui est arrivé est annoncé, puis la cause telle quelle.
      if (summary) toast.success(summary);
      if (failed) toast.error(failed.error!);
      else if (!summary) toast.toast('Rien de nouveau');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disconnect = useDisconnectBank({
    onSuccess: () => {
      setDisconnectId(null);
      toast.success('Banque déconnectée');
    },
  });

  function submitPaste() {
    if (!auth) return;
    const parsed = parseReturn(pasted);
    if (!parsed) {
      setPasteError("Cette adresse ne contient pas de code d'autorisation. Colle l'URL complète affichée après la connexion à la banque.");
      return;
    }
    complete.mutate({ connectionId: auth.connectionId, ...parsed });
  }

  if (state.isPending) {
    return (
      <div className={styles.panel}>
        <SkeletonRows rows={2} />
      </div>
    );
  }
  if (!state.data) return null;

  const visible = state.data.connections.filter((c) => c.status !== 'revoked');
  const connection = visible.at(-1) ?? null;

  return (
    <div className={styles.panel}>
      {connection ? (
        <div className={styles.head}>
          <Badge tone={STATUS_LABEL[connection.status].tone}>{STATUS_LABEL[connection.status].label}</Badge>
        </div>
      ) : null}

      {auth ? (
        <>
          <ol className={styles.steps}>
            <li>Un onglet La Banque Postale s'est ouvert : identifie-toi et autorise l'accès à tes comptes.</li>
            <li>À la fin, le navigateur affiche une erreur de connexion sécurisée sur localhost. C'est normal.</li>
            <li>Copie l'adresse complète de cette page et colle-la ici.</li>
          </ol>
          <div className={styles.paste}>
            <Input
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setPasteError(null);
              }}
              placeholder="https://localhost:3000/bank-sync/callback?code=...&state=..."
              aria-label="URL de retour"
              aria-invalid={pasteError ? true : undefined}
              aria-describedby={pasteError ? 'bank-paste-error' : undefined}
              spellCheck={false}
            />
            <Button variant="primary" onClick={submitPaste} loading={complete.isPending} disabled={!pasted.trim()}>
              Valider
            </Button>
            <Button variant="ghost" onClick={() => setAuth(null)} disabled={complete.isPending}>
              Annuler
            </Button>
          </div>
          {pasteError ? (
            <FieldError id="bank-paste-error">{pasteError}</FieldError>
          ) : (
            <p className={styles.text}>
              L'onglet ne s'est pas ouvert ?{' '}
              <a href={auth.url} target="_blank" rel="noreferrer">
                Ouvrir la page d'autorisation
              </a>
              .
            </p>
          )}
        </>
      ) : !state.data.configured ? (
        <>
          <p className={styles.text}>Il faut d'abord renseigner l'accès Enable Banking, dans la section ci-dessous.</p>
        </>
      ) : !connection ? (
        <>
          <p className={styles.text}>Les doublons, virements internes et opérations prévues sont traités comme pour un relevé.</p>
          <div className={styles.actions}>
            <Button variant="primary" icon={<Landmark aria-hidden />} loading={start.isPending} onClick={() => start.mutate(undefined)}>
              Connecter La Banque Postale
            </Button>
          </div>
        </>
      ) : connection.status === 'authorized' ? (
        <LinkStep
          key={connection.id}
          connection={connection}
          accounts={accounts.data ?? []}
          syncStartByAccount={state.data.syncStartByAccount}
          onLinked={() => run.mutate(undefined)}
        />
      ) : (
        <ActiveState
          connection={connection}
          accounts={accounts.data ?? []}
          syncing={run.isPending}
          onSync={() => run.mutate(undefined)}
          onRenew={() => start.mutate(connection.id)}
          renewing={start.isPending}
          disconnecting={disconnect.isPending}
          onDisconnect={() => setDisconnectId(connection.id)}
        />
      )}
      <ConfirmDialog
        open={disconnectId !== null}
        onClose={() => setDisconnectId(null)}
        onConfirm={() => disconnectId !== null && disconnect.mutate(disconnectId)}
        title="Déconnecter La Banque Postale ?"
        description="Les opérations déjà importées restent."
        confirmLabel="Déconnecter"
        loading={disconnect.isPending}
        error={disconnect.error ? errorMessage(disconnect.error) : null}
      />
    </div>
  );
}

function LinkStep({
  connection,
  accounts,
  syncStartByAccount,
  onLinked,
}: {
  connection: BankConnectionView;
  accounts: Account[];
  syncStartByAccount: Record<number, ISODate>;
  onLinked: () => void;
}) {
  const toast = useToast();
  const [links, setLinks] = useState<Record<number, string>>(() => Object.fromEntries(connection.accounts.map((a) => [a.id, a.accountId ? String(a.accountId) : ''])));
  const link = useLinkBankAccounts({
    onSuccess: () => {
      toast.success('Comptes associés, première synchronisation en cours');
      onLinked();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const chosen = Object.values(links).filter(Boolean);
  const startOf = (bankAccountId: number): ISODate | null => {
    const chosenId = links[bankAccountId];
    return chosenId ? (syncStartByAccount[Number(chosenId)] ?? null) : null;
  };
  const duplicates = new Set(chosen).size !== chosen.length;

  return (
    <>
      <p className={styles.text}>Associe chaque compte de la banque à un compte Runway. La synchronisation reprend au lendemain de la dernière opération importée de chaque compte.</p>
      <div className={styles.accounts}>
        {connection.accounts.map((a) => (
          <div key={a.id} className={styles.accountRow}>
            <span className={styles.bankName}>
              <strong>{a.bankName}</strong>
              {a.iban ? <span className={['mono', styles.iban].join(' ')}>{a.iban}</span> : null}
            </span>
            <ArrowRight className={styles.arrow} aria-hidden />
            <span className={styles.target}>
              <Select
                value={links[a.id] ?? ''}
                onChange={(e) => setLinks({ ...links, [a.id]: e.target.value })}
                aria-label={`Compte Runway pour ${a.bankName}`}
                aria-describedby={startOf(a.id) ? `bank-start-${a.id}` : undefined}
              >
                <option value="">Ignorer ce compte</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </Select>
              {startOf(a.id) ? (
                <span id={`bank-start-${a.id}`} className={styles.hint}>
                  Reprise des opérations à partir du {formatDateLong(startOf(a.id)!)}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {duplicates ? <Notice tone="negative">Deux comptes de la banque pointent vers le même compte Runway.</Notice> : null}
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={link.isPending}
          disabled={duplicates || chosen.length === 0}
          onClick={() =>
            link.mutate({
              connectionId: connection.id,
              links: connection.accounts.map((a) => ({ bankAccountId: a.id, accountId: links[a.id] ? Number(links[a.id]) : null })),
            })
          }
        >
          Terminer
        </Button>
      </div>
    </>
  );
}

function ActiveState({
  connection,
  accounts,
  syncing,
  onSync,
  onRenew,
  renewing,
  disconnecting,
  onDisconnect,
}: {
  connection: BankConnectionView;
  accounts: Account[];
  syncing: boolean;
  onSync: () => void;
  onRenew: () => void;
  renewing: boolean;
  disconnecting: boolean;
  onDisconnect: () => void;
}) {
  const expired = connection.status === 'expired';
  const expiresIn = connection.validUntil ? daysUntil(connection.validUntil) : null;
  const expiringSoon = !expired && expiresIn !== null && expiresIn <= EXPIRY_WARNING_DAYS;
  const linked = connection.accounts.filter((a) => a.accountId !== null);
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `Compte ${id}`;

  return (
    <>
      <div className={styles.meta}>
        <span>{connection.lastSyncAt ? `Dernière synchronisation ${formatDateTime(connection.lastSyncAt)}` : 'Jamais synchronisé'}</span>
        {connection.validUntil ? <span className="muted">· consentement jusqu'au {formatDateLong(connection.validUntil.slice(0, 10))}</span> : null}
      </div>
      <div className={styles.accounts}>
        {linked.map((a) => (
          <div key={a.id} className={styles.accountRow}>
            <span className={styles.bankName}>
              <strong>{a.bankName}</strong>
              {a.iban ? <span className={['mono', styles.iban].join(' ')}>{a.iban}</span> : null}
            </span>
            <ArrowRight className={styles.arrow} aria-hidden />
            <span>
              {accountName(a.accountId!)}
              {a.syncFrom ? <span className="muted"> · depuis le {formatDateLong(a.syncFrom)}</span> : null}
              {a.lastSyncedDate ? <span className="muted"> · à jour au {formatDateLong(a.lastSyncedDate)}</span> : null}
            </span>
          </div>
        ))}
      </div>
      {connection.lastError ? <Notice tone="negative" role="status">Dernière synchronisation en échec : {connection.lastError}</Notice> : null}
      {expired ? (
        <Notice tone="negative">Le consentement a expiré : la banque n'envoie plus rien tant que tu ne l'as pas renouvelé.</Notice>
      ) : expiringSoon ? (
        <p className={styles.text}>Le consentement expire {expiresIn! <= 0 ? "aujourd'hui" : `dans ${plural(expiresIn!, 'jour')}`}. Renouvelle-le pour ne pas interrompre la synchronisation.</p>
      ) : null}
      <div className={styles.actions}>
        {expired || expiringSoon ? (
          <Button variant="primary" icon={<RefreshCw aria-hidden />} loading={renewing} onClick={onRenew}>
            Renouveler le consentement
          </Button>
        ) : null}
        {!expired ? (
          <Button variant={expiringSoon ? 'secondary' : 'primary'} icon={<RefreshCw aria-hidden />} loading={syncing} onClick={onSync}>
            Synchroniser maintenant
          </Button>
        ) : null}
        <Button variant="ghost" loading={disconnecting} onClick={onDisconnect}>
          Déconnecter
        </Button>
      </div>
    </>
  );
}
