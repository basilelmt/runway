import { ChevronDown, Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Dot } from './Badge';
import styles from './Pills.module.css';

/** Recherche en pastille, pour les barres d'outils. */
export const SearchPill = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function SearchPill({ className, ...rest }, ref) {
  return (
    <span className={[styles.pill, styles.search, className ?? ''].join(' ')}>
      <Search aria-hidden className={styles.icon} />
      <input ref={ref} type="search" className={styles.searchInput} {...rest} />
    </span>
  );
});

type FilterPillProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** Valeur neutre (« Tous ») : ailleurs, la pastille passe en encre et propose une croix. */
  resetValue?: string;
};

/** Filtre en pastille : un select natif habillé. */
export function FilterPill({ value, onChange, resetValue, className, children, ...rest }: FilterPillProps) {
  const active = resetValue !== undefined && value !== resetValue;
  const name = rest['aria-label'];
  return (
    <span className={[styles.pill, styles.filter, active ? styles.active : '', className ?? ''].join(' ')}>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {children}
      </select>
      {active ? (
        <button type="button" className={styles.clear} onClick={() => onChange(resetValue)} aria-label={name ? `Effacer le filtre ${name}` : 'Effacer le filtre'}>
          <X aria-hidden />
        </button>
      ) : (
        <ChevronDown aria-hidden className={styles.caret} />
      )}
    </span>
  );
}

type InlinePillOption = { value: number; label: string; color?: string };

type InlinePillProps = {
  'aria-label': string;
  value: number | null;
  onChange: (value: number | null) => void;
  options: InlinePillOption[];
  placeholder: string;
  /** Valeur proposée (règle, Claude) en attente de validation. */
  tone?: 'suggested';
  disabled?: boolean;
};

/** Choix d'enveloppe dans une ligne de liste : pointillés tant que rien n'est choisi, puce pleine ensuite. */
export function InlinePill({ value, onChange, options, placeholder, tone, disabled, 'aria-label': ariaLabel }: InlinePillProps) {
  const current = options.find((o) => o.value === value);
  return (
    <div className={[styles.inline, current ? styles.filled : '', tone === 'suggested' ? styles.suggested : '', disabled ? styles.disabled : ''].join(' ')}>
      <span className={styles.face} aria-hidden="true">
        {current ? (
          <>
            {current.color ? <Dot color={current.color} size={8} /> : null}
            <span className={styles.faceLabel}>{current.label}</span>
          </>
        ) : (
          <span className={styles.faceLabel}>{placeholder}</span>
        )}
        <ChevronDown className={styles.caret} />
      </span>
      <select aria-label={ariaLabel} className={styles.overlay} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
