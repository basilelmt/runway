import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ onChange }: { onChange: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <MoneyInput
      aria-label="Montant"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('MoneyInput', () => {
  it('convertit la saisie en centimes et normalise au blur', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Montant');
    await userEvent.type(input, '12,5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
    await userEvent.tab();
    expect(input).toHaveValue('12,50');
  });

  it('renvoie null pour une saisie invalide', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Montant'), 'abc');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
