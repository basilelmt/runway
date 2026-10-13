import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MonthPaceChart } from './MonthPaceChart';

const props = { budget: 310_00, monthStart: '2026-10-01', monthEnd: '2026-10-31' };

function plotOf(container: HTMLElement) {
  const plot = screen.getByRole('img');
  // jsdom ne mesure rien : une zone de 310 px, soit 10 px par jour.
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 310, height: 170, right: 310, bottom: 170, x: 0, y: 0, toJSON: () => ({}) });
  return { plot, container };
}

describe('MonthPaceChart', () => {
  it('résume le mois pour un lecteur d’écran : cumul du jour et écart au rythme', () => {
    render(<MonthPaceChart {...props} daily={[10_00, 25_00, 40_00]} />);
    // Rythme au 3 : 310 × 3 / 31 = 30 €, on a dépensé 40 €.
    expect(screen.getByRole('img')).toHaveAccessibleName('Dépenses courantes : 40,00 € au 3 oct., 10,00 € au-dessus du rythme prévu, sur 310,00 € pour le mois.');
  });

  it('montre au survol le cumul et le rythme du jour pointé, sans dépasser aujourd’hui', () => {
    const { container } = render(<MonthPaceChart {...props} daily={[10_00, 25_00, 40_00]} />);
    const { plot } = plotOf(container);
    fireEvent.pointerMove(plot, { clientX: 15 });
    expect(screen.getByText('2 oct.').parentElement).toHaveTextContent('2 oct.Dépensé25,00 €Rythme prévu20,00 €');

    fireEvent.pointerMove(plot, { clientX: 300 });
    expect(screen.getByText('Aujourd’hui').parentElement).toHaveTextContent('Dépensé40,00 €');

    fireEvent.pointerLeave(plot);
    expect(screen.queryByText('Aujourd’hui')).not.toBeInTheDocument();
  });

  it('affiche sous la courbe l’écart au rythme du jour et le cumul sur le budget', () => {
    render(<MonthPaceChart {...props} daily={[10_00, 25_00, 40_00]} />);
    expect(screen.getByText('10,00 €', { selector: 'strong' }).parentElement).toHaveTextContent('10,00 € au-dessus du rythme · 40,00 € / 310,00 €');
  });

  it('le 1er du mois, un seul point et pas de repère de jour qui chevaucherait le début de l’axe', () => {
    render(<MonthPaceChart {...props} daily={[0]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Dépenses courantes : 0,00 € au 1 oct., 10,00 € sous le rythme prévu, sur 310,00 € pour le mois.');
    expect(screen.queryByText('1', { exact: true })).not.toBeInTheDocument();
  });
});
