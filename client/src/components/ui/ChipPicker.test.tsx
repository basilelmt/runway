import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChipPicker } from './ChipPicker';

const options = [
  { value: null, label: 'À ranger' },
  { value: 10, label: 'Courses', color: '#4f8a5b' },
  { value: 11, label: 'Restos', color: '#c2703d' },
];

function Harness({ onChange }: { onChange: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(10);
  return (
    <ChipPicker
      aria-label="Enveloppe"
      options={options}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('ChipPicker', () => {
  it('expose un groupe radio et coche l’option choisie', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Enveloppe' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Courses' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Restos' }));
    expect(onChange).toHaveBeenLastCalledWith(11);
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveAttribute('aria-checked', 'true');
  });

  it('n’a qu’un arrêt de tabulation et se pilote aux flèches', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Courses' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(11);
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith(11);
  });
});
