import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SortingRuleDialog } from './SortingRuleDialog';

const envelopes = [
  { id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];

describe('SortingRuleDialog', () => {
  it('range dans une enveloppe choisie en pastilles', async () => {
    const onSubmit = vi.fn();
    render(<SortingRuleDialog open onClose={vi.fn()} envelopes={envelopes} onSubmit={onSubmit} />);
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle règle de tri', hidden: true });
    await userEvent.type(within(dialog).getByLabelText('Le libellé contient'), 'carrefour');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Restos', hidden: true }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Créer la règle', hidden: true }));
    expect(onSubmit).toHaveBeenCalledWith({ pattern: 'carrefour', envelopeId: 11 });
  });
});
