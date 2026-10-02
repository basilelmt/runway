import { formatEuros } from '@shared/money';
import styles from './Amount.module.css';

type AmountProps = {
  cents: number;
  /** `auto` colore selon le signe, `neutral` reste en encre, `always` force le + sur les positifs. */
  tone?: 'auto' | 'neutral' | 'always';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

export function Amount({ cents, tone = 'auto', size = 'md', className }: AmountProps) {
  const toneClass = tone === 'neutral' ? '' : cents < 0 ? styles.negative : cents > 0 && tone === 'always' ? styles.positive : '';
  return (
    <span className={['mono', styles.amount, styles[size], toneClass, className ?? ''].join(' ')}>
      {formatEuros(cents, { signed: tone === 'always' })}
    </span>
  );
}
