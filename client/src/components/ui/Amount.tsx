import { formatEuros } from '@shared/money';
import { useCountUp } from '@/lib/motion';
import styles from './Amount.module.css';

type AmountProps = {
  cents: number;
  /** `auto` colore selon le signe, `neutral` reste en encre, `always` force le + sur les positifs. */
  tone?: 'auto' | 'neutral' | 'always';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Fait défiler le chiffre jusqu'à sa valeur (chiffres clés uniquement). */
  animate?: boolean;
  className?: string;
};

export function Amount({ animate = false, ...props }: AmountProps) {
  return animate ? <AnimatedAmount {...props} /> : <AmountText {...props} />;
}

function AnimatedAmount(props: Omit<AmountProps, 'animate'>) {
  const shown = useCountUp(props.cents);
  // Le lecteur d'écran lit la valeur finale, pas chaque étape du défilement.
  return <AmountText {...props} cents={shown} label={formatEuros(props.cents, { signed: props.tone === 'always' })} />;
}

function AmountText({ cents, tone = 'auto', size = 'md', className, label }: Omit<AmountProps, 'animate'> & { label?: string }) {
  const toneClass = tone === 'neutral' ? '' : cents < 0 ? styles.negative : cents > 0 && tone === 'always' ? styles.positive : '';
  const text = formatEuros(cents, { signed: tone === 'always' });
  return (
    <span className={['num', styles.amount, styles[size], toneClass, className ?? ''].join(' ')} aria-label={label}>
      {label ? <span aria-hidden>{text}</span> : text}
    </span>
  );
}
