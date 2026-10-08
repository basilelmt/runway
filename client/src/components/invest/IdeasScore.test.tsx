import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IdeasSummary } from '@shared/api-types';
import { IdeasScore } from './IdeasScore';

const summary: IdeasSummary = {
  closedCount: 3,
  beatCount: 2,
  avgExcess: 0.04,
  hundredEach: { invested: 300_00, ideas: 315_00, bench: 303_00 },
  filter: null,
};

describe('IdeasScore', () => {
  it('sans écartée close, pas de comparaison du tri', () => {
    render(<IdeasScore summary={summary} />);
    expect(screen.queryByText(/tri de Claude/)).not.toBeInTheDocument();
  });

  it('compare retenues et écartées', () => {
    const { rerender } = render(<IdeasScore summary={{ ...summary, filter: { keptCount: 3, keptAvgExcess: 0.04, droppedCount: 5, droppedAvgExcess: -0.01 } }} />);
    expect(screen.getByText(/les retenues ont fait/)).toHaveTextContent(
      'Face au S&P 500, les retenues ont fait +4,0 % en moyenne (3 idées), les écartées -1,0 % (5 idées). Le tri de Claude aide.',
    );
    rerender(<IdeasScore summary={{ ...summary, filter: { keptCount: 1, keptAvgExcess: -0.02, droppedCount: 1, droppedAvgExcess: 0.03 } }} />);
    expect(screen.getByText(/les retenues ont fait/)).toHaveTextContent('(1 idée)');
    expect(screen.getByText(/les retenues ont fait/)).toHaveTextContent('Le tri de Claude n’aide pas encore.');
  });
});
