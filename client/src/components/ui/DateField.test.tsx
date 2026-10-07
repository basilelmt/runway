import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fromParts, parts, today } from '@shared/dates';
import { DateField, DateRangeField } from './DateField';

const longDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Nom accessible d'un jour du calendrier : « … 15 octobre 2026 … ». */
function dayName(iso: string): RegExp {
  const { year, month, day } = parts(iso);
  return new RegExp(longDay.format(new Date(Date.UTC(year, month - 1, day, 12))));
}

function SingleHarness({ initial, onChange, ...rest }: { initial: string | null; onChange: (v: string | null) => void; clearable?: boolean; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      aria-label="Date"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      {...rest}
    />
  );
}

describe('DateField', () => {
  it('affiche la date en français, ou le texte de remplacement', () => {
    const { rerender } = render(<DateField aria-label="Date" value="2026-10-01" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('jeu. 1 oct. 2026');
    rerender(<DateField aria-label="Date" value={null} placeholder="Sans fin" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Sans fin');
  });

  it('choisit un jour dans le calendrier puis se ferme', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(screen.getByRole('button', { name: dayName('2026-10-15') }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('jeu. 15 oct. 2026');
  });

  it('propose Aujourd’hui et Effacer', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} clearable placeholder="Sans fin" />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
    expect(onChange).toHaveBeenLastCalledWith(today());
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Sans fin');
  });

  it('se ferme sur Échap sans rien changer et rend le focus', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Date' });
    await userEvent.click(trigger);
    expect(screen.getByRole('grid')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DateRangeField', () => {
  it('choisit une période en deux clics', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
      return (
        <DateRangeField
          aria-label="Période"
          from={range.from}
          to={range.to}
          onChange={(r) => {
            setRange(r);
            onChange(r);
          }}
        />
      );
    }
    render(<Harness />);
    const { year, month } = parts(today());
    const start = fromParts(year, month, 10);
    const end = fromParts(year, month, 12);
    await userEvent.click(screen.getByRole('button', { name: 'Période' }));
    const grid = screen.getByRole('grid');
    await userEvent.click(within(grid).getByRole('button', { name: dayName(start) }));
    await userEvent.click(within(grid).getByRole('button', { name: dayName(end) }));
    expect(onChange).toHaveBeenLastCalledWith({ from: start, to: end });
  });
});
