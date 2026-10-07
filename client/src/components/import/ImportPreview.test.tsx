import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ImportPreviewRow } from '@shared/api-types';
import { ImportPreview } from './ImportPreview';

const envelopes = [
  { id: 1, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 2, name: 'Loisirs', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];

const rows: ImportPreviewRow[] = [
  { index: 0, date: '2026-03-12', label: 'CARREFOUR', signedAmount: -6230, status: 'new', fingerprint: 'a', plannedId: null, plannedLabel: null, envelopeId: 1, note: null, transferToAccountId: null },
  { index: 1, date: '2026-03-06', label: 'VIREMENT DUPONT', signedAmount: 12000, status: 'new', fingerprint: 'b', plannedId: null, plannedLabel: null, envelopeId: null, note: null, transferToAccountId: null },
  { index: 2, date: '2026-03-05', label: 'PRLV LOYER', signedAmount: -80000, status: 'matched', fingerprint: 'c', plannedId: 42, plannedLabel: 'Loyer', envelopeId: 2, note: null, transferToAccountId: null },
  { index: 3, date: '2026-03-01', label: 'CAFE', signedAmount: -250, status: 'duplicate', fingerprint: 'd', plannedId: null, plannedLabel: null, envelopeId: null, note: null, transferToAccountId: null },
];

function Harness({ onChange = vi.fn() }: { onChange?: (rows: ImportPreviewRow[]) => void }) {
  const [state, setState] = useState(rows);
  return (
    <ImportPreview
      rows={state}
      envelopes={envelopes}
      onChange={(next) => {
        setState(next);
        onChange(next);
      }}
      onCommit={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

describe('ImportPreview', () => {
  it('affiche les trois sections avec les bons compteurs', () => {
    render(<Harness />);
    expect(screen.getByText('Nouvelles').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Rapprochées').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Doublons ignorés').nextSibling).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Importer 3 opérations' })).toBeInTheDocument();
    expect(screen.getByText('↳ remplace la prévue « Loyer »')).toBeInTheDocument();
  });

  it('"Détacher" repasse une ligne rapprochée en nouvelle', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Détacher' }));
    const last = onChange.mock.calls.at(-1)![0] as ImportPreviewRow[];
    expect(last.find((r) => r.index === 2)).toMatchObject({ status: 'new', plannedId: null, plannedLabel: null });
    expect(screen.getByText('Nouvelles').nextSibling).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Importer 3 opérations' })).toBeInTheDocument();
    expect(screen.getByText('détachée')).toBeInTheDocument();
  });

  it('permet de changer l’enveloppe d’une dépense nouvelle', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const select = screen.getByLabelText('Enveloppe pour CARREFOUR');
    await userEvent.selectOptions(select, '2');
    const last = onChange.mock.calls.at(-1)![0] as ImportPreviewRow[];
    expect(last[0]?.envelopeId).toBe(2);
    expect(within(select.closest('div')!).getByRole('combobox')).toHaveValue('2');
  });

  it('affiche "Rien de nouveau" quand tout est doublon', () => {
    render(<ImportPreview rows={rows.filter((r) => r.status === 'duplicate')} envelopes={envelopes} onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Rien de nouveau dans ce relevé')).toBeInTheDocument();
  });
});
