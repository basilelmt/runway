import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';
import { Button } from './Button';
import { CountBadge } from './CountBadge';
import { Kbd } from './Kbd';
import { Notice } from './Notice';
import { PulseDot } from './PulseDot';
import { Spinner } from './Spinner';

describe('Button text', () => {
  it('est un vrai bouton avec la variante texte', () => {
    render(<Button variant="text">Afficher les archivées</Button>);
    expect(screen.getByRole('button', { name: 'Afficher les archivées' })).toHaveAttribute('type', 'button');
  });

  it('affiche le spinner partagé pendant le chargement', () => {
    render(<Button loading>Enregistrer</Button>);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-spinner]')).not.toBeNull();
  });
});

describe('Spinner', () => {
  it('est décoratif', () => {
    const { container } = render(<Spinner size={20} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden');
    expect(el.style.width).toBe('20px');
  });
});

describe('Kbd', () => {
  it('rend une touche clavier', () => {
    render(<Kbd>N</Kbd>);
    expect(screen.getByText('N').tagName).toBe('KBD');
  });
});

describe('CountBadge', () => {
  it('annonce son libellé', () => {
    render(<CountBadge count={10} label="10 opérations à ranger" />);
    // Le chiffre est montré, le libellé est lu : texte masqué visuellement plutôt qu'un aria-label sur un span sans rôle.
    expect(screen.getByText('10')).toHaveAttribute('aria-hidden');
    expect(screen.getByText('10 opérations à ranger')).toHaveClass('visually-hidden');
  });

  it('ne rend rien à zéro', () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BrandMark', () => {
  it('est décoratif et dimensionné', () => {
    const { container } = render(<BrandMark size={20} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden');
    expect(el.style.width).toBe('20px');
  });
});

describe('Notice', () => {
  it('peut devenir une région vivante pour un travail en cours (fournée d’idées)', () => {
    render(
      <Notice tone="neutral" icon={<PulseDot />} role="status">
        4 chercheurs fouillent l’actualité. Ça prend plusieurs minutes, tu peux continuer ailleurs.
      </Notice>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('4 chercheurs fouillent l’actualité.');
  });
});

describe('PulseDot', () => {
  it('peut porter un libellé', () => {
    render(<PulseDot label="En cours" />);
    expect(screen.getByRole('status', { name: 'En cours' })).toBeInTheDocument();
  });
});
