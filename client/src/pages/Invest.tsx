import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { PortfolioRange } from '@shared/api-types';
import { errorMessage } from '@/api/client';
import { usePortfolio } from '@/api/hooks';
import { AddHoldingDialog } from '@/components/invest/AddHoldingDialog';
import { BinancePanel } from '@/components/invest/BinancePanel';
import { HoldingDialog } from '@/components/invest/HoldingDialog';
import { HoldingList } from '@/components/invest/HoldingList';
import { IdeasSection } from '@/components/invest/IdeasSection';
import { PortfolioChart } from '@/components/invest/PortfolioChart';
import { PortfolioSummary, PortfolioSummarySkeleton } from '@/components/invest/PortfolioSummary';
import { useAutoBinanceSync } from '@/components/invest/useAutoBinanceSync';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, ErrorState, SectionHeader } from '@/components/ui';

export function InvestPage() {
  const [range, setRange] = useState<PortfolioRange>('6m');
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const portfolio = usePortfolio(range);
  useAutoBinanceSync(portfolio.data?.binance.configured ?? false);

  const data = portfolio.data;
  const open = data?.holdings.find((h) => h.id === openId) ?? null;
  const addButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setAddKey((k) => k + 1);
        setAdding(true);
      }}
    >
      Ajouter une position
    </Button>
  );

  return (
    <div className="page">
      <PageHeader title="Investir" subtitle="Ton portefeuille, et des idées tirées de l’actualité." actions={data && data.holdings.length > 0 ? addButton : null} />

      {portfolio.isError ? (
        <ErrorState title="Impossible de charger le portefeuille" description={errorMessage(portfolio.error)} onRetry={() => portfolio.refetch()} />
      ) : !data ? (
        <PortfolioSummarySkeleton />
      ) : (
        <>
          {data.holdings.length > 0 ? (
            <>
              <PortfolioSummary portfolio={data} />
              <PortfolioChart series={data.series} holdings={data.holdings} range={range} onRange={setRange} loading={portfolio.isPlaceholderData} />
            </>
          ) : null}
          <section aria-labelledby="holdings-title">
            <SectionHeader id="holdings-title" title="Positions" />
            <HoldingList holdings={data.holdings} onOpen={setOpenId} emptyAction={addButton} />
            <BinancePanel state={data.binance} />
          </section>
        </>
      )}

      <IdeasSection />

      <AddHoldingDialog key={addKey} open={adding} onClose={() => setAdding(false)} />
      <HoldingDialog holding={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
