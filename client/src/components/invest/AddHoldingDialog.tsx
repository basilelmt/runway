import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { AssetSearchResult } from '@shared/api-types';
import { platforms, type Platform } from '@shared/invest';
import { errorMessage } from '@/api/client';
import { useAssetSearch, useCreateHolding } from '@/api/hooks';
import { Button, Dialog, Field, Input, Segmented, useToast } from '@/components/ui';
import { platformLabel } from '@/lib/invest';
import { emptyTrade, parseTrade, TradeFields, type TradeDraft, type TradeErrors } from './TradeFields';
import styles from './Forms.module.css';
import search from './AddHoldingDialog.module.css';

const SEARCH_DELAY_MS = 300;

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Une plateforme probable d'après le type d'actif : les cryptos sur Binance, le reste sur Trade Republic. */
const guessPlatform = (a: AssetSearchResult): Platform => (/crypto/i.test(a.type) || a.ticker.endsWith('-EUR') ? 'binance' : 'trade_republic');

type Props = { open: boolean; onClose: () => void };

/** Recherche d'un actif puis premier achat. Le parent change la `key` à chaque ouverture pour repartir de zéro. */
export function AddHoldingDialog({ open, onClose }: Props) {
  const formId = useId();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [asset, setAsset] = useState<AssetSearchResult | null>(null);
  const [platform, setPlatform] = useState<Platform>('trade_republic');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<TradeDraft>(emptyTrade(1_00));
  const [errors, setErrors] = useState<TradeErrors & { name?: string }>({});
  const results = useAssetSearch(useDebounced(query, SEARCH_DELAY_MS));
  const create = useCreateHolding({
    onSuccess: () => {
      toast.success('Position ajoutée');
      onClose();
    },
  });

  function choose(a: AssetSearchResult) {
    const p = guessPlatform(a);
    setAsset(a);
    setName(a.name);
    setPlatform(p);
    setDraft((d) => ({ ...d, fees: p === 'trade_republic' ? 1_00 : 0 }));
  }

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!asset) return;
    const parsed = parseTrade(draft);
    const nameError = name.trim() ? undefined : 'Nom manquant';
    if (!parsed.ok || nameError) return setErrors({ ...(parsed.ok ? {} : parsed.errors), name: nameError });
    create.mutate({ platform, ticker: asset.ticker, name: name.trim(), firstTrade: parsed.trade });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ajouter une position"
      description={asset ? `${asset.ticker} · ${asset.exchange}` : 'Cherche l’actif par son nom, son ticker ou son ISIN.'}
      footer={
        asset ? (
          <div className={[styles.actions, styles.actionsSpread].join(' ')}>
            <Button variant="ghost" onClick={() => setAsset(null)}>
              Changer d’actif
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={create.isPending}>
              Ajouter la position
            </Button>
          </div>
        ) : null
      }
    >
      {!asset ? (
        <div className={styles.fields}>
          <Field label="Recherche">
            {(id) => (
              <div className={search.searchBox}>
                <Search aria-hidden />
                <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="iShares S&P 500, SXR8, IE00B5BMR087" autoFocus autoComplete="off" />
              </div>
            )}
          </Field>
          {results.isError ? (
            <p className={styles.error} role="alert">
              {errorMessage(results.error)}
            </p>
          ) : null}
          {results.data && results.data.length === 0 ? <p className={search.empty}>Aucun résultat chez Yahoo Finance.</p> : null}
          {results.data && results.data.length > 0 ? (
            <ul className={search.results} aria-label="Résultats">
              {results.data.map((a) => (
                <li key={a.ticker}>
                  <button type="button" className={search.result} onClick={() => choose(a)}>
                    <span className={search.resultName}>{a.name}</span>
                    <span className={search.resultMeta}>
                      <span className="mono">{a.ticker}</span> · {a.exchange} · {a.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <form id={formId} className={styles.form} onSubmit={submit} noValidate>
          <Field label="Nom" error={errors.name}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Plateforme">
            {() => (
              <Segmented
                label="Plateforme"
                value={platform}
                onChange={(p) => {
                  setPlatform(p);
                  setDraft((d) => ({ ...d, fees: p === 'trade_republic' ? 1_00 : d.fees }));
                }}
                options={platforms.map((p) => ({ value: p, label: platformLabel(p) }))}
              />
            )}
          </Field>
          <TradeFields
            draft={draft}
            errors={errors}
            unit="part"
            allowSell={false}
            onChange={(d) => {
              setDraft(d);
              setErrors({});
            }}
          />
          {create.error ? (
            <p className={styles.error} role="alert">
              {errorMessage(create.error)}
            </p>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
