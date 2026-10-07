import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Checkbox } from './Checkbox';
import { Field } from './Field';
import { FormSection } from './FormSection';
import { Input, Textarea } from './Input';

describe('Field', () => {
  it('relie le label, l’aide et le champ', () => {
    render(<Field label="Nom" hint="Ex. Loyer">{(id, describedBy) => <Input id={id} aria-describedby={describedBy} />}</Field>);
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAccessibleDescription('Ex. Loyer');
  });

  it('remplace l’aide par l’erreur, annoncée', () => {
    render(
      <Field label="Nom" hint="Ex. Loyer" error="Nom requis">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} />}
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Nom requis');
    expect(screen.queryByText('Ex. Loyer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveAccessibleDescription('Nom requis');
  });

  it('fournit l’id du label pour nommer un groupe', () => {
    render(<Field label="Enveloppe">{(_id, _d, labelId) => <div role="radiogroup" aria-labelledby={labelId} />}</Field>);
    expect(screen.getByRole('radiogroup', { name: 'Enveloppe' })).toBeInTheDocument();
  });
});

describe('Textarea', () => {
  it('passe en mono à la demande', () => {
    render(<Textarea aria-label="Clé" mono />);
    expect(screen.getByLabelText('Clé').className).toMatch(/mono/);
  });
});

describe('Checkbox', () => {
  it('se coche en cliquant sur son libellé et décrit son aide', async () => {
    render(<Checkbox label="Compte d’épargne" hint="Hors budget" />);
    const box = screen.getByRole('checkbox', { name: /Compte d’épargne/ });
    await userEvent.click(screen.getByText('Compte d’épargne'));
    expect(box).toBeChecked();
    expect(screen.getByText('Hors budget')).toBeInTheDocument();
  });
});

describe('FormSection', () => {
  it('regroupe les champs sous un intertitre', () => {
    render(
      <FormSection title="Quand">
        <Input aria-label="Jour" />
      </FormSection>,
    );
    expect(screen.getByRole('group', { name: 'Quand' })).toContainElement(screen.getByLabelText('Jour'));
  });
});
