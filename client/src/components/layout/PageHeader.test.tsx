import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('pose un titre de niveau 1, un surtitre et un sous-titre', () => {
    render(<PageHeader eyebrow="Jeudi 8 octobre" title="Octobre" subtitle="Encore 23 jours ce mois-ci" />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { level: 1, name: 'Octobre' })).toBeInTheDocument();
    expect(screen.getByText('Jeudi 8 octobre')).toBeInTheDocument();
    expect(screen.getByText('Encore 23 jours ce mois-ci')).toBeInTheDocument();
  });

  it('propose un lien retour', () => {
    render(<PageHeader title="Importer un relevé" back={{ to: '/operations', label: 'Opérations' }} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: 'Opérations' })).toHaveAttribute('href', '/operations');
  });
});
