import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { EnvelopeRow } from './EnvelopeRow';

const courses: EnvelopeWithBalance = {
  id: 1,
  name: 'Courses',
  color: '#4f8a5b',
  // 250 € de charges fixes + 150 € de complément.
  monthlyExtra: 150_00,
  monthlyCharges: 250_00,
  monthlyBudget: 400_00,
  sortOrder: 0,
  archived: false,
  isSavings: false,
  balance: 250_00,
  allocatedThisMonth: 400_00,
  spentThisMonth: 150_00,
  toFundThisMonth: 0,
};

describe('EnvelopeRow', () => {
  it('affiche le dépensé face au budget et le disponible', () => {
    render(<EnvelopeRow envelope={courses} />);
    expect(screen.getByRole('progressbar', { name: 'Courses : 150,00 € dépensés sur 400,00 €' })).toBeInTheDocument();
    expect(screen.getByText('250,00 €')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('un clic sur la ligne ouvre le détail, sans gêner le menu d’actions', async () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(<EnvelopeRow envelope={courses} onOpen={onOpen} menu={[{ label: 'Modifier', onSelect: onEdit }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir les dépenses de Courses' }));
    expect(onOpen).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actions pour Courses' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Modifier' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('sans budget, l’indique au lieu d’une jauge', () => {
    render(<EnvelopeRow envelope={{ ...courses, monthlyExtra: null, monthlyCharges: 0, monthlyBudget: 0 }} />);
    expect(screen.getByText('Sans budget')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
