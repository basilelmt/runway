import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog, DialogFooter } from './Dialog';

describe('Dialog', () => {
  it('est nommé par son titre et appelle onClose sur Échap', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Test">
        <p>contenu</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test', hidden: true });
    dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('téléporte les actions du formulaire dans le pied', async () => {
    render(
      <Dialog open onClose={vi.fn()} title="Titre">
        <form id="f">
          <DialogFooter start={<span>gauche</span>}>
            <button type="submit" form="f">
              Valider
            </button>
          </DialogFooter>
        </form>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Titre', hidden: true });
    const footer = dialog.querySelector('footer')!;
    const button = await within(footer).findByText('Valider');
    expect(within(footer).getByText('gauche')).toBeInTheDocument();
    expect(dialog.querySelector('form')!.contains(button)).toBe(false);
  });

  it('rend le pied sur place hors dialogue', () => {
    render(
      <DialogFooter>
        <button type="button">Seul</button>
      </DialogFooter>,
    );
    expect(screen.getByRole('button', { name: 'Seul' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('confirme, annule et affiche une erreur', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Supprimer ?" confirmLabel="Supprimer" error="Échec réseau">
        Loyer
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Supprimer ?', hidden: true });
    expect(within(dialog).getByText('Loyer')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert', { hidden: true })).toHaveTextContent('Échec réseau');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer', hidden: true }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler', hidden: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
