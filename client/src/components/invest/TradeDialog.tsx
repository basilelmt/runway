import { useId, useState } from 'react';
import type { HoldingView, TradeView } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { useAddTrade, useUpdateTrade } from '@/api/hooks';
import { Button, Dialog, useToast } from '@/components/ui';
import { unitOf } from './HoldingList';
import { emptyTrade, parseTrade, TradeFields, tradeFromInput, type TradeDraft, type TradeErrors } from './TradeFields';
import styles from './Forms.module.css';

type Props = { holding: HoldingView; trade: TradeView | null; open: boolean; onClose: () => void };

/** Ajoute ou modifie un mouvement manuel ; Trade Republic facture 1 € par ordre, prérempli. */
export function TradeDialog({ holding, trade, open, onClose }: Props) {
  const formId = useId();
  const toast = useToast();
  const [draft, setDraft] = useState<TradeDraft>(() => (trade ? tradeFromInput(trade) : emptyTrade(holding.platform === 'trade_republic' ? 1_00 : 0)));
  const [errors, setErrors] = useState<TradeErrors>({});
  const done = (message: string) => () => {
    toast.success(message);
    onClose();
  };
  const add = useAddTrade({ onSuccess: done('Mouvement ajouté') });
  const update = useUpdateTrade({ onSuccess: done('Mouvement modifié') });
  const serverError = add.error ?? update.error;

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = parseTrade(draft);
    if (!parsed.ok) return setErrors(parsed.errors);
    if (trade) update.mutate({ id: trade.id, ...parsed.trade });
    else add.mutate({ holdingId: holding.id, ...parsed.trade });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={trade ? 'Modifier le mouvement' : 'Ajouter un mouvement'}
      description={holding.name}
      footer={
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={add.isPending || update.isPending}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <TradeFields
          draft={draft}
          errors={errors}
          unit={unitOf(holding.ticker)}
          onChange={(d) => {
            setDraft(d);
            setErrors({});
          }}
        />
        {serverError ? (
          <p className={styles.error} role="alert">
            {errorMessage(serverError)}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
