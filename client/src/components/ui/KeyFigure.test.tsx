import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Amount } from './Amount';
import { KeyFigure } from './KeyFigure';
import { Stat, StatGroup } from './StatGroup';

describe('KeyFigure', () => {
  it('forme une région nommée par son libellé, avec le chiffre et son contexte', () => {
    render(<KeyFigure label="Dépensé ce mois-ci" figure={<Amount cents={124317} size="xl" tone="neutral" />} context="sur 2 401,00 € prévus" caption="Sous le rythme du mois." />);
    const region = screen.getByRole('region', { name: 'Dépensé ce mois-ci' });
    expect(within(region).getByText(/1\s243,17\s€/)).toBeInTheDocument();
    expect(within(region).getByText('sur 2 401,00 € prévus')).toBeInTheDocument();
    expect(within(region).getByText('Sous le rythme du mois.')).toBeInTheDocument();
  });

  it('place les stats à droite', () => {
    render(
      <KeyFigure
        label="Dépensé ce mois-ci"
        figure="1 243,17 €"
        aside={
          <StatGroup direction="column" divided>
            <Stat label="Marge restante">1 157,83 €</Stat>
          </StatGroup>
        }
      />,
    );
    const list = screen.getByRole('definition');
    expect(list).toHaveTextContent('1 157,83 €');
    expect(screen.getByRole('term')).toHaveTextContent('Marge restante');
  });

  it('cache la décoration aux lecteurs d’écran', () => {
    const { container } = render(<KeyFigure label="Valeur du portefeuille" figure="6 051,12 €" variant="night" decoration={<canvas />} />);
    expect(container.querySelector('canvas')!.parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('StatGroup', () => {
  it('marque la stat mise en avant', () => {
    render(
      <StatGroup>
        <Stat label="Revenus par mois">2 450,00 €</Stat>
        <Stat label="Reste pour vivre et investir" emphasis>
          865,77 €
        </Stat>
      </StatGroup>,
    );
    expect(screen.getAllByRole('term')).toHaveLength(2);
    expect(screen.getByText('Reste pour vivre et investir').parentElement).toHaveAttribute('data-emphasis', 'true');
  });
});
