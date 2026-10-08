import { Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useCreateTransaction } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { QuickEntry } from '@/components/transactions/QuickEntry';
import { useAsk } from '@/components/ask/ask-context';
import { Dialog, useToast } from '@/components/ui';
import { QuickAddContext } from './quick-add-context';
import styles from './QuickAdd.module.css';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Saisie rapide d'une opération : bouton flottant sur mobile, `useQuickAdd()` ailleurs,
 * et raccourcis clavier globaux : `n` nouvelle opération, `k` Demander, `/` recherche.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const toast = useToast();
  const create = useCreateTransaction();
  const { toggle: toggleAsk } = useAsk();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'n') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'k') {
        e.preventDefault();
        toggleAsk();
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
  }, [toggleAsk]);

  return (
    <QuickAddContext.Provider value={() => setOpen(true)}>
      {children}
      <button type="button" className={styles.fab} onClick={() => setOpen(true)} aria-label="Nouvelle opération">
        <Plus aria-hidden />
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          create.reset();
        }}
        title="Nouvelle opération"
        size="lg"
      >
        {open ? (
          <QuickEntry
            resetKey={resetKey}
            submitting={create.isPending}
            serverError={create.error ? errorMessage(create.error) : null}
            onSubmit={(input, again) =>
              create.mutate(input, {
                onSuccess: () => {
                  toast.success(again ? 'Enregistrée. Au suivant.' : 'Opération enregistrée');
                  if (again) setResetKey((k) => k + 1);
                  else setOpen(false);
                },
              })
            }
          />
        ) : null}
      </Dialog>
    </QuickAddContext.Provider>
  );
}
