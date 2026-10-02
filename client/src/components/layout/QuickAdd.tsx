import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCreateTransaction } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import styles from './QuickAdd.module.css';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Bouton flottant "+" et raccourcis clavier globaux : `n` nouvelle opération, `/` recherche. */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const create = useCreateTransaction({
    onSuccess: (t) => {
      toast.success(`${KIND_LABELS[t.kind]} enregistrée`);
      setOpen(false);
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'n') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className={styles.fab} onClick={() => setOpen(true)} aria-label="Nouvelle opération" title="Nouvelle opération (n)">
        <Plus aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nouvelle opération">
        {open ? (
          <TransactionForm
            key={String(open)}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setOpen(false)}
            submitting={create.isPending}
            serverError={create.error ? errorMessage(create.error) : null}
          />
        ) : null}
      </Dialog>
    </>
  );
}
