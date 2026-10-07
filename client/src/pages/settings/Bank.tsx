import { KeyRound, Landmark, Upload } from 'lucide-react';
import { useState } from 'react';
import { settingsSchema } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useAccounts, useImports, useSaveSettings, useSettings, useTestBankCredentials } from '@/api/hooks';
import { BankSyncPanel } from '@/components/import/BankSyncPanel';
import { Button, ButtonLink, Field, Input, SkeletonRows, Textarea, useToast } from '@/components/ui';
import { formatDateLong } from '@/lib/format';
import styles from './Settings.module.css';
import bank from './Bank.module.css';

export function BankSettings() {
  return (
    <div>
      <section className={styles.section}>
        <div className={styles.aside}>
          <h2>Synchronisation bancaire</h2>
          <p>Runway récupère tes opérations La Banque Postale tout seul, à chaque ouverture, puis les range avec tes règles de tri.</p>
        </div>
        <div className={styles.content}>
          <BankSyncPanel />
        </div>
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
      <div className={styles.aside}>
        <h2>Accès Enable Banking</h2>
        <p>
          Crée une application <strong>Production</strong> sur{' '}
          <a href="https://enablebanking.com/cp/" target="_blank" rel="noreferrer">
            enablebanking.com/cp
          </a>{' '}
          avec l’URL de redirection <code className="mono">https://localhost:3000/bank-sync/callback</code>.
        </p>
        <p>Dans l’application, « Link accounts » pour lier tes comptes (mode Restricted Production), puis colle ici l’identifiant et la clé privée.</p>
      </div>
      <div className={styles.content}>
        {settings.isPending ? (
          <SkeletonRows rows={2} />
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
                  <Textarea id={id} aria-describedby={describedBy} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'} spellCheck={false} />
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
      </div>
    </section>
  );
}

const HISTORY_PREVIEW = 8;

function ImportHistory() {
  const imports = useImports();
  const [showAll, setShowAll] = useState(false);
  const accounts = useAccounts(true);
  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `Compte ${id}`;

  return (
    <section className={styles.section}>
      <div className={styles.aside}>
        <h2>Historique des imports</h2>
        <p>Synchronisations et relevés importés à la main. Les doublons sont ignorés, les opérations prévues rapprochées.</p>
        <ButtonLink to="/operations/importer" size="sm" icon={<Upload />} className={bank.importLink}>
          Importer un relevé
        </ButtonLink>
      </div>
      <div className={styles.content}>
        {imports.isPending ? (
          <SkeletonRows rows={3} />
        ) : imports.error ? (
          <p className={styles.error} role="alert">
            {errorMessage(imports.error)}
          </p>
        ) : imports.data.length === 0 ? (
          <p className={styles.text}>Aucun import pour le moment.</p>
        ) : (
          <div className={bank.history}>
            <div className={[bank.historyRow, bank.historyHead].join(' ')} aria-hidden>
              <span>Date</span>
              <span>Source</span>
              <span>Compte</span>
              <span className={bank.num}>Ajoutées</span>
              <span className={bank.num}>Rapprochées</span>
              <span className={bank.num}>Doublons</span>
            </div>
            <div className="ledger">
              {(showAll ? imports.data : imports.data.slice(0, HISTORY_PREVIEW)).map((imp) => (
                <div key={imp.id} className={bank.historyRow}>
                  <span className="num">{formatDateLong(imp.importedAt.slice(0, 10))}</span>
                  <span className={bank.file} title={imp.fileName}>
                    {imp.fileName}
                  </span>
                  <span>{accountName(imp.accountId)}</span>
                  <span className={['num', bank.num].join(' ')}>{imp.newCount}</span>
                  <span className={['num', bank.num].join(' ')}>{imp.matchedCount}</span>
                  <span className={['num', bank.num, 'muted'].join(' ')}>{imp.duplicateCount}</span>
                </div>
              ))}
            </div>
            {imports.data.length > HISTORY_PREVIEW ? (
              <button type="button" className={bank.toggle} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'Afficher moins' : `Afficher tout l’historique (${imports.data.length})`}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
