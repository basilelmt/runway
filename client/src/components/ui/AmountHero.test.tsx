import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AmountHero } from './AmountHero';

function Harness({ initial = null, onChange }: { initial?: number | null; onChange: (v: number | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AmountHero
        id="amount"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <button type="button" onClick={() => setValue(null)}>
        Vider
      </button>
    </>
  );
}

describe('AmountHero', () => {
  it('convertit la saisie en centimes et la normalise en sortie de champ', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Montant');
    await userEvent.type(input, '12,5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
    await userEvent.tab();
    expect(input).toHaveValue('12,50');
  });

  it('affiche une valeur initiale et suit une remise à zéro', async () => {
    render(<Harness initial={1457} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Montant')).toHaveValue('14,57');
    await userEvent.click(screen.getByRole('button', { name: 'Vider' }));
    expect(screen.getByLabelText('Montant')).toHaveValue('');
  });

  it('ignore les caractères qui ne sont pas des chiffres', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Montant'), 'a8b');
    expect(screen.getByLabelText('Montant')).toHaveValue('8');
    expect(onChange).toHaveBeenLastCalledWith(800);
  });
});
