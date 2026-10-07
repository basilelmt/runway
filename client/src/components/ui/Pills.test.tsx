import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilterPill, InlinePill, SearchPill } from './Pills';

describe('SearchPill', () => {
  it('est un champ de recherche nommé', () => {
    render(<SearchPill aria-label="Rechercher" placeholder="Rechercher un libellé (/)" />);
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toBeInTheDocument();
  });
});

describe('FilterPill', () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <FilterPill
        aria-label="Compte"
        value={value}
        resetValue=""
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      >
        <option value="">Tous les comptes</option>
        <option value="1">Courant</option>
      </FilterPill>
    );
  }

  it('propose une croix seulement quand le filtre est actif', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Effacer le filtre Compte' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Compte'), '1');
    expect(onChange).toHaveBeenLastCalledWith('1');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer le filtre Compte' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByLabelText('Compte')).toHaveValue('');
  });
});

describe('InlinePill', () => {
  const options = [
    { value: 10, label: 'Courses', color: '#4f8a5b' },
    { value: 11, label: 'Restos', color: '#c2703d' },
  ];

  it('affiche le texte d’attente puis l’enveloppe choisie', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <InlinePill
          aria-label="Enveloppe pour UBER"
          value={value}
          placeholder="+ Enveloppe"
          options={options}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    expect(container).toHaveTextContent('+ Enveloppe');
    await userEvent.selectOptions(screen.getByLabelText('Enveloppe pour UBER'), '11');
    expect(onChange).toHaveBeenLastCalledWith(11);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('Restos');
  });
});
