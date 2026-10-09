import { useEffect, useId, useState } from 'react';
import type { AssetSearchResult } from '@shared/api-types';
import { platforms, type Platform } from '@shared/invest';
import { errorMessage } from '@/api/client';
import { useAssetSearch, useCreateHolding } from '@/api/hooks';
import { Button, Dialog, DialogFooter, Field, FieldError, Input, ListRow, SearchPill, Segmented, useToast } from '@/components/ui';
import { platformLabel } from '@/lib/invest';
import { unitOf } from './HoldingList';
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
    >
      {!asset ? (
        <div className={styles.fields}>
          <Field label="Recherche" className={search.field}>
            {(id) => <SearchPill id={id} className={search.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="iShares S&P 500, SXR8, IE00B5BMR087" autoFocus autoComplete="off" />}
          </Field>
          <FieldError>{results.isError ? errorMessage(results.error) : null}</FieldError>
          {results.data && results.data.length === 0 ? <p className={search.empty}>Aucun résultat chez Yahoo Finance.</p> : null}
          {results.data && results.data.length > 0 ? (
            <ul className={['ledger', search.results].join(' ')} aria-label="Résultats">
              {results.data.map((a) => (
                <ListRow
                  key={a.ticker}
                  compact
                  onClick={() => choose(a)}
                  clickLabel={`Choisir ${a.name} (${a.ticker})`}
                  title={a.name}
                  meta={
                    <span>
                      <span className="mono">{a.ticker}</span> · {a.exchange} · {a.type}
                    </span>
                  }
                />
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
            unit={unitOf(asset.ticker)}
            allowSell={false}
            onChange={(d) => {
              setDraft(d);
              setErrors({});
            }}
          />
          <FieldError>{create.error ? errorMessage(create.error) : null}</FieldError>
          <DialogFooter
            start={
              <Button variant="ghost" onClick={() => setAsset(null)}>
                Changer d’actif
              </Button>
            }
          >
            <Button type="submit" form={formId} variant="primary" loading={create.isPending}>
              Ajouter la position
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
