import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowDownLeft } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Range } from './Range';
import { Segmented } from './Segmented';

describe('Segmented', () => {
  it('affiche une icône décorative à côté du libellé', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Type"
        value="expense"
        onChange={onChange}
        options={[
          { value: 'expense', label: 'Dépense' },
          { value: 'income', label: 'Revenu', icon: <ArrowDownLeft /> },
        ]}
      />,
    );
    const income = screen.getByRole('radio', { name: 'Revenu' });
    expect(income.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(income);
    expect(onChange).toHaveBeenCalledWith('income');
  });
});

describe('Range', () => {
  it('est un curseur', () => {
    render(<Range aria-label="Horizon" min={30} max={365} defaultValue={90} />);
    expect(screen.getByRole('slider', { name: 'Horizon' })).toHaveValue('90');
  });
});
