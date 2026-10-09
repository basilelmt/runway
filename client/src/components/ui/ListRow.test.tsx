import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EnvelopeTag } from './EnvelopeTag';
import { ColumnHeader, GroupLabel, ListRow, ListRowSkeleton } from './ListRow';

describe('ListRow', () => {
  it('annonce la ligne choisie par aria-pressed, seulement si elle est cliquable', () => {
    render(
      <ul>
        <ListRow title="Compte courant" onClick={() => {}} clickLabel="Tracer Compte courant" pressed />
        <ListRow title="Livret A" onClick={() => {}} clickLabel="Tracer Livret A" pressed={false} />
        <ListRow title="Livret Jeune" onClick={() => {}} clickLabel="Tracer Livret Jeune" />
      </ul>,
    );
    expect(screen.getByRole('button', { name: 'Tracer Compte courant' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tracer Livret A' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Tracer Livret Jeune' })).not.toHaveAttribute('aria-pressed');
  });

  it('rend un élément de liste avec titre, méta et fin', () => {
    render(
      <ul>
        <ListRow title="ACHAT CB SNCF" meta="Compte courant" trail="−11,00 €" trailSub="le 7 oct." />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('ACHAT CB SNCF');
    expect(item).toHaveTextContent('Compte courant');
    expect(item).toHaveTextContent('−11,00 €');
    expect(item).toHaveTextContent('le 7 oct.');
  });

  it('ouvre la ligne au clic sans déclencher ses actions', async () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <ul>
        <ListRow title="Courses" onClick={onClick} clickLabel="Voir les dépenses de Courses" actions={<button type="button" onClick={onAction}>Actions</button>} />
      </ul>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les dépenses de Courses' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('listitem').className).not.toMatch(/undefined/);
  });

  it('garde cliquables les contrôles posés dans la méta et la fin d’une ligne cliquable', async () => {
    const onClick = vi.fn();
    const onMeta = vi.fn();
    const onTrail = vi.fn();
    render(
      <ul>
        <ListRow
          title="Loyer"
          onClick={onClick}
          clickLabel="Modifier Loyer"
          meta={
            <button type="button" onClick={onMeta}>
              Logement
            </button>
          }
          trail={
            <button type="button" onClick={onTrail}>
              Voir l’opération
            </button>
          }
        />
      </ul>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Logement' }));
    expect(onMeta).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’opération' }));
    expect(onTrail).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('peut être un div hors liste', () => {
    render(<ListRow as="div" title="Seule" />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('Seule')).toBeInTheDocument();
  });
});

describe('ListRowSkeleton', () => {
  it('rend le nombre de lignes demandé, caché aux lecteurs d’écran', () => {
    const { container } = render(<ListRowSkeleton rows={3} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.children).toHaveLength(3);
  });
});

describe('ColumnHeader', () => {
  it('est décoratif (les lignes portent déjà leurs libellés)', () => {
    const { container } = render(<ColumnHeader title="Enveloppe" middle="Dépensé ce mois / budget" trail="Disponible" actions />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('Disponible');
  });
});

describe('GroupLabel', () => {
  it('rend un titre du niveau demandé', () => {
    render(<GroupLabel as="h2">Hier</GroupLabel>);
    expect(screen.getByRole('heading', { level: 2, name: 'Hier' })).toBeInTheDocument();
  });
});

describe('EnvelopeTag', () => {
  it('affiche le nom et un point de couleur décoratif', () => {
    const { container } = render(<EnvelopeTag name="Transports" color="#2f7d5b" />);
    expect(screen.getByText('Transports')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden]')).toHaveStyle({ background: '#2f7d5b' });
  });
});
