import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fromParts, parts, today } from '@shared/dates';
import { DateField, DateRangeField } from './DateField';

// Le calendrier est chargé à la demande : on le charge une fois ici pour que chaque test n'attende pas sa transformation.
beforeAll(async () => {
  await import('./Calendar');
});

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
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAccessibleDescription('jeu. 1 oct. 2026');
    rerender(<DateField aria-label="Date" value={null} placeholder="Sans fin" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Sans fin');
  });

  it('choisit un jour dans le calendrier puis se ferme', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(await screen.findByRole('button', { name: dayName('2026-10-15') }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('jeu. 15 oct. 2026');
  });

  it('propose Aujourd’hui et Effacer', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} clearable placeholder="Sans fin" />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Aujourd’hui' }));
    expect(onChange).toHaveBeenLastCalledWith(today());
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Sans fin');
  });

  it('se ferme sur Échap sans rien changer et rend le focus', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Date' });
    await userEvent.click(trigger);
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function RangeHarness({ initial, onChange }: { initial: { from: string | null; to: string | null }; onChange: (r: { from: string | null; to: string | null }) => void }) {
  const [range, setRange] = useState(initial);
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

describe('DateRangeField', () => {
  it('choisit une période en deux clics, sans rien transmettre au premier', async () => {
    const onChange = vi.fn();
    render(<RangeHarness initial={{ from: null, to: null }} onChange={onChange} />);
    const { year, month } = parts(today());
    const start = fromParts(year, month, 10);
    const end = fromParts(year, month, 12);
    await userEvent.click(screen.getByRole('button', { name: 'Période' }));
    const grid = await screen.findByRole('grid');
    await userEvent.click(within(grid).getByRole('button', { name: dayName(start) }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(within(grid).getByRole('button', { name: dayName(end) }));
    expect(onChange).toHaveBeenLastCalledWith({ from: start, to: end });
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('remplace une période existante, dans n’importe quel ordre', async () => {
    const onChange = vi.fn();
    const { year } = parts(today());
    const day = (d: number) => fromParts(year, 10, d);
    render(<RangeHarness initial={{ from: day(1), to: day(5) }} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Période' })).toHaveAccessibleDescription('Du 1 oct. au 5 oct.');
    await userEvent.click(screen.getByRole('button', { name: 'Période' }));
    const grid = await screen.findByRole('grid');
    await userEvent.click(within(grid).getByRole('button', { name: dayName(day(25)) }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(within(grid).getByRole('button', { name: dayName(day(20)) }));
    expect(onChange).toHaveBeenLastCalledWith({ from: day(20), to: day(25) });
  });
});
