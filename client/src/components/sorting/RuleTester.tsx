import { useEffect, useState } from 'react';
import type { Envelope } from '@shared/schemas';
import { testSortingRule } from '@/api/hooks';
import { Dot, Field, Input } from '@/components/ui';
import styles from './RuleTester.module.css';

type RuleTesterProps = { envelopes: Envelope[]; refreshKey: unknown };

/** Champ d'essai : tape un libellé, vois l'enveloppe que les règles lui donneraient. */
export function RuleTester({ envelopes, refreshKey }: RuleTesterProps) {
  const [label, setLabel] = useState('');
  const [result, setResult] = useState<{ label: string; envelopeId: number | null } | null>(null);

  useEffect(() => {
    const trimmed = label.trim();
    if (!trimmed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      testSortingRule(trimmed)
        .then((r) => {
          if (!cancelled) setResult({ label: trimmed, envelopeId: r.envelopeId });
        })
        .catch(() => {
          if (!cancelled) setResult(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [label, refreshKey]);

  const envelope = result?.envelopeId == null ? null : envelopes.find((e) => e.id === result.envelopeId) ?? null;

  return (
    <div className={styles.tester}>
      <Field label="Tester un libellé" className={styles.field}>
        {(id) => <Input id={id} type="search" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="CB CARREFOUR MARKET 12/03" className="mono" />}
      </Field>
      <div className={styles.result} aria-live="polite">
        {result && result.label === label.trim() ? (
          envelope ? (
            <span className={styles.hit}>
              → <Dot color={envelope.color} /> {envelope.name}
            </span>
          ) : (
            <span className={styles.miss}>Aucune règle ne correspond</span>
          )
        ) : null}
      </div>
    </div>
  );
}
