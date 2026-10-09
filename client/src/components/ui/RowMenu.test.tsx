import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RowMenu } from './RowMenu';

function setup() {
  const edit = vi.fn();
  const archive = vi.fn();
  render(
    <RowMenu
      label="Actions pour Courses"
      items={[
        { label: 'Archiver', onSelect: archive, danger: true },
        { label: 'Modifier', onSelect: edit },
        { label: 'Déplacer vers…', onSelect: vi.fn(), disabled: true },
      ]}
    />,
  );
  return { edit, archive };
}

describe('RowMenu', () => {
  it('ouvre un menu nommé depuis un bouton', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions pour Courses' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Actions pour Courses' })).toBeVisible();
  });

  it('range les actions destructrices en dernier, après un séparateur', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Actions pour Courses' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Modifier', 'Déplacer vers…', 'Archiver']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('se pilote au clavier et ferme après le choix', async () => {
    const { edit } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Actions pour Courses' }));
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    // L'élément désactivé est sauté.
    expect(screen.getByRole('menuitem', { name: 'Archiver' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(edit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Actions pour Courses' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('se ferme avec Échap et rend le focus au bouton', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions pour Courses' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
