import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SectionHeader, SectionLink, Total } from './SectionHeader';

describe('SectionHeader', () => {
  it('rend un titre de niveau 2 par défaut, identifiable', () => {
    render(<SectionHeader id="env-title" title="Enveloppes" description="Les plus serrées d’abord." />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Enveloppes' });
    expect(heading).toHaveAttribute('id', 'env-title');
    expect(screen.getByText('Les plus serrées d’abord.')).toBeInTheDocument();
  });

  it('accepte un niveau 3 et un élément à droite', () => {
    render(<SectionHeader as="h3" title="Mouvements" aside={<button type="button">Ajouter</button>} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Mouvements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });
});

describe('SectionLink', () => {
  it('est un lien avec une flèche décorative', () => {
    render(<SectionLink to="/budget">Voir les 11</SectionLink>, { wrapper: MemoryRouter });
    const link = screen.getByRole('link', { name: 'Voir les 11' });
    expect(link).toHaveAttribute('href', '/budget');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Total', () => {
  it('affiche le libellé et le montant', () => {
    render(<Total cents={365385} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText(/3\s653,85\s€/)).toBeInTheDocument();
  });
});
