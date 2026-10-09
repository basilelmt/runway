import { KeyRound, Landmark, Upload } from 'lucide-react';
import { useState } from 'react';
import { settingsSchema } from '@shared/schemas';
import type { ImportRecord } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useImports, useSaveSettings, useSettings, useTestBankCredentials } from '@/api/hooks';
import { BankSyncPanel } from '@/components/import/BankSyncPanel';
import { Button, ButtonLink, ColumnHeader, Disclosure, EmptyState, ErrorState, Field, Input, ListRow, ListRowSkeleton, SectionHeader, Textarea, listRowDate, useToast } from '@/components/ui';
import { formatDateCompact, plural } from '@/lib/format';
import styles from './Settings.module.css';
import bank from './Bank.module.css';

export function BankSettings() {
  return (
    <div>
      <section className={styles.section}>
        <SectionHeader title="Synchronisation bancaire" description="Runway récupère tes opérations La Banque Postale tout seul, à chaque ouverture, puis les range avec tes règles de tri." />
        <BankSyncPanel />
      </section>

      <BankCredentials />

      <ImportHistory />
    </div>
  );
}

function BankCredentials() {
  const toast = useToast();
  const settings = useSettings();
  const save = useSaveSettings({ onSuccess: () => toast.success('Accès enregistré'), onError: (e) => toast.error(errorMessage(e)) });
  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [errors, setErrors] = useState<{ appId?: string; privateKey?: string }>({});
  // Une clé déjà enregistrée n'est jamais réaffichée : on peut seulement la remplacer.
  const [replacingKey, setReplacingKey] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const test = useTestBankCredentials({
    onSuccess: (r) => setTestResult(`Connexion réussie : application « ${r.name} » (${r.environment.toLowerCase()})`),
    onError: (e) => setTestResult(`Échec : ${errorMessage(e)}`),
  });

  const [loaded, setLoaded] = useState<typeof settings.data | null>(null);
  if (settings.data && settings.data !== loaded) {
    setLoaded(settings.data);
    setAppId(settings.data.enableBankingAppId);
    setPrivateKey(settings.data.enableBankingPrivateKey);
    setReplacingKey(false);
  }
  const keyStored = Boolean(settings.data?.enableBankingPrivateKey) && !replacingKey;

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({ ...settings.data, enableBankingAppId: appId, enableBankingPrivateKey: privateKey });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'enableBankingAppId') next.appId = issue.message;
        if (issue.path[0] === 'enableBankingPrivateKey') next.privateKey = issue.message;
      }
      setErrors(next);
      return;
    }
    if (replacingKey && !parsed.data.enableBankingPrivateKey) {
      setErrors({ privateKey: 'Colle la nouvelle clé, ou garde la clé actuelle' });
      return;
    }
    if (parsed.data.enableBankingPrivateKey && !/BEGIN (RSA )?PRIVATE KEY/.test(parsed.data.enableBankingPrivateKey)) {
      setErrors({ privateKey: 'Colle le contenu complet du fichier .pem, avec les lignes BEGIN et END' });
      return;
    }
    setErrors({});
    setTestResult(null);
    save.mutate(parsed.data);
  }

  return (
    <section className={styles.section} id="acces">
      <SectionHeader
        title="Accès Enable Banking"
        description={
          <>
            Crée une application <strong>Production</strong> sur{' '}
            <a href="https://enablebanking.com/cp/" target="_blank" rel="noreferrer">
              enablebanking.com/cp
            </a>{' '}
            avec l’URL de redirection <code className="mono">https://localhost:3000/bank-sync/callback</code>.
            <br />
            Dans l’application, « Link accounts » pour lier tes comptes (mode Restricted Production), puis colle ici l’identifiant et la clé privée.
          </>
        }
      />
      {settings.isPending ? (
        <ListRowSkeleton rows={2} />
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <Field label="Application ID" error={errors.appId} hint="Affiché dans la console Enable Banking, onglet API applications.">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={appId} onChange={(e) => setAppId(e.target.value)} autoComplete="off" spellCheck={false} className={styles.code} />}
          </Field>
          {keyStored ? (
            <div className={bank.keyStored}>
              <span className={bank.keyLabel}>Clé privée (PEM)</span>
              <div className={bank.keyLine}>
                <span className={bank.keyStatus}>
                  <KeyRound aria-hidden /> Clé enregistrée
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPrivateKey('');
                    setReplacingKey(true);
                  }}
                >
                  Remplacer la clé
                </Button>
              </div>
            </div>
          ) : (
            <Field label="Clé privée (PEM)" error={errors.privateKey} hint="Le fichier .pem téléchargé à la création de l’application. Stockée dans la base locale, jamais exportée.">
              {(id, describedBy) => (
                <Textarea id={id} aria-describedby={describedBy} mono value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'} spellCheck={false} />
              )}
            </Field>
          )}
          {testResult ? (
            <p className={styles.status} role="status">
              {testResult}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Enregistrer
            </Button>
            {replacingKey && settings.data?.enableBankingPrivateKey ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setPrivateKey(settings.data?.enableBankingPrivateKey ?? '');
                  setErrors({});
                  setReplacingKey(false);
                }}
              >
                Garder la clé actuelle
              </Button>
            ) : null}
            <Button
              icon={<Landmark aria-hidden />}
              loading={test.isPending}
              disabled={!settings.data?.enableBankingAppId || !settings.data?.enableBankingPrivateKey}
              onClick={() => test.mutate()}
            >
              Tester la connexion
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

const HISTORY_PREVIEW = 8;

function ImportHistory() {
  const imports = useImports();
  const accounts = useAccounts(true);
  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `Compte ${id}`;

  const row = (imp: ImportRecord) => (
    <ListRow
      key={imp.id}
      lead={<span className={listRowDate}>{formatDateCompact(imp.importedAt.slice(0, 10))}</span>}
      title={<span className="mono">{imp.fileName}</span>}
      meta={`${plural(imp.newCount, 'ajoutée')} · ${plural(imp.matchedCount, 'rapprochée')} · ${plural(imp.duplicateCount, 'doublon')}`}
      trail={accountName(imp.accountId)}
    />
  );

  return (
    <section className={styles.section}>
      <SectionHeader
        title="Historique des imports"
        description="Synchronisations et relevés importés à la main. Les doublons sont ignorés, les opérations prévues rapprochées."
        aside={
          <ButtonLink to="/operations/importer" size="sm" icon={<Upload />}>
            Importer un relevé
          </ButtonLink>
        }
      />
      {imports.isPending ? (
        <ListRowSkeleton rows={3} />
      ) : imports.error ? (
        <ErrorState title="Impossible de charger l’historique des imports" description={errorMessage(imports.error)} onRetry={() => imports.refetch()} />
      ) : imports.data.length === 0 ? (
        <EmptyState icon={<Upload />} title="Aucun import pour le moment" />
      ) : (
        <>
          <ColumnHeader
            title={
              <span className={bank.columnTitle}>
                <span className={listRowDate}>Date</span>
                Fichier
              </span>
            }
            trail="Compte"
          />
          <ul className="ledger">{imports.data.slice(0, HISTORY_PREVIEW).map(row)}</ul>
          {imports.data.length > HISTORY_PREVIEW ? (
            <Disclosure label="Afficher tout l’historique" openLabel="Masquer l’historique complet" count={imports.data.length}>
              <ul className="ledger">{imports.data.slice(HISTORY_PREVIEW).map(row)}</ul>
            </Disclosure>
          ) : null}
        </>
      )}
    </section>
  );
}
