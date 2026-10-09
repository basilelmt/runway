import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure } from './Disclosure';
import { ErrorState } from './ErrorState';
import { FieldError } from './FieldError';
import { Notice } from './Notice';
import { TodoItem } from './TodoItem';

describe('Notice', () => {
  it('annonce les erreurs immédiatement', () => {
    render(<Notice tone="negative">La synchronisation a échoué.</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('La synchronisation a échoué.');
  });

  it('forme un groupe nommé avec son action', () => {
    render(
      <Notice tone="marking" label="Créer une règle de tri" action={<button type="button">Créer la règle</button>}>
        Toujours « Courses » ?
      </Notice>,
    );
    const group = screen.getByRole('group', { name: 'Créer une règle de tri' });
    expect(group).toHaveTextContent('Toujours « Courses » ?');
    expect(screen.getByRole('button', { name: 'Créer la règle' })).toBeInTheDocument();
  });
});

describe('TodoItem', () => {
  it('est un lien vers la tâche', () => {
    render(
      <TodoItem to="/operations?vue=a-ranger" icon={<Inbox />}>
        10 opérations à ranger
      </TodoItem>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole('link', { name: '10 opérations à ranger' })).toHaveAttribute('href', '/operations?vue=a-ranger');
  });
});

describe('FieldError', () => {
  it('ne rend rien sans message', () => {
    const { container } = render(<FieldError>{null}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });

  it('annonce le message', () => {
    render(<FieldError>Le montant doit être supérieur à zéro.</FieldError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Le montant doit être supérieur à zéro.');
  });
});

describe('ErrorState', () => {
  it('propose de réessayer', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Impossible de charger le budget" description="Le serveur ne répond pas." onRetry={onRetry} />);
    expect(screen.getByRole('heading', { name: 'Impossible de charger le budget' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('Disclosure', () => {
  it('replie et déplie son contenu', async () => {
    render(
      <Disclosure label="Afficher les enveloppes archivées" openLabel="Masquer les enveloppes archivées" count={2}>
        <p>Vacances</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button', { name: 'Afficher les enveloppes archivées (2)' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Vacances')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Masquer les enveloppes archivées (2)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Vacances')).toBeInTheDocument();
  });
});
