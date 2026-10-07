import { ChevronDown } from 'lucide-react';
import { lazy, Suspense, useId, useState, type CSSProperties, type ReactNode, type ToggleEvent } from 'react';
import { addDays, formatDateWithWeekday, today } from '@shared/dates';
import { formatDateCompact } from '@/lib/format';
import styles from './DateField.module.css';

/** `line` dans un formulaire, `pill` dans une barre d'outils, `chip` à côté de puces à contour. */
type Variant = 'line' | 'pill' | 'chip';

type CommonProps = {
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  variant?: Variant;
  className?: string;
};

export type DateFieldProps = CommonProps & {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Propose « Effacer » : pour une date facultative. */
  clearable?: boolean;
  /** Raccourcis « Aujourd’hui » et « Hier ». */
  shortcuts?: boolean;
};

export type DateRangeFieldProps = CommonProps & {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
};

const Calendar = lazy(() => import('./Calendar'));

/** Ancre CSS propre à chaque champ : le calendrier se place sous son bouton. */
function anchor(name: string, property: 'anchorName' | 'positionAnchor'): CSSProperties {
  return { [property]: name } as unknown as CSSProperties;
}

type PopoverFieldProps = CommonProps & {
  filled: boolean;
  text: string;
  children: (close: () => void) => ReactNode;
};

/** Bouton qui ouvre un calendrier en popover natif, au-dessus du dialogue qui le contient. */
function PopoverField({ id, placeholder, variant = 'line', className, filled, text, children, ...aria }: PopoverFieldProps) {
  const reactId = useId();
  const popoverId = `date-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [open, setOpen] = useState(false);
  // Fermeture par id plutôt que par ref : `close` est transmis à `children` pendant le rendu,
  // et un ref ne doit jamais être lu à ce moment-là.
  const close = () => document.getElementById(popoverId)?.hidePopover();

  return (
    <>
      <button
        type="button"
        id={id}
        className={[styles.trigger, styles[variant], filled ? styles.filled : '', className ?? ''].join(' ')}
        popoverTarget={popoverId}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={anchor(`--${popoverId}`, 'anchorName')}
        {...aria}
      >
        <span className={filled ? styles.value : styles.placeholder}>{filled ? text : placeholder}</span>
        <ChevronDown aria-hidden className={styles.caret} />
      </button>
      <div
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-label="Calendrier"
        className={styles.popover}
        style={anchor(`--${popoverId}`, 'positionAnchor')}
        onToggle={(e: ToggleEvent<HTMLDivElement>) => setOpen(e.newState === 'open')}
      >
        {open ? <Suspense fallback={<div className={styles.loading} />}>{children(close)}</Suspense> : null}
      </div>
    </>
  );
}

/** Date en français (« jeu. 1 oct. 2026 ») avec calendrier ; valeur ISO `YYYY-MM-DD` ou null. */
export function DateField({ value, onChange, clearable = false, shortcuts = true, placeholder = 'Choisir une date', min, max, ...rest }: DateFieldProps) {
  const yesterday = addDays(today(), -1);
  const inBounds = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  return (
    <PopoverField {...rest} placeholder={placeholder} filled={value !== null} text={value ? formatDateWithWeekday(value) : ''}>
      {(close) => {
        const pick = (iso: string | null) => {
          onChange(iso);
          close();
        };
        return (
          <>
            <Calendar mode="single" value={value} min={min} max={max} onPick={pick} />
            {shortcuts || clearable ? (
              <div className={styles.shortcuts}>
                {shortcuts && inBounds(today()) ? (
                  <button type="button" className={styles.shortcut} onClick={() => pick(today())}>
                    Aujourd’hui
                  </button>
                ) : null}
                {shortcuts && inBounds(yesterday) ? (
                  <button type="button" className={styles.shortcut} onClick={() => pick(yesterday)}>
                    Hier
                  </button>
                ) : null}
                {clearable && value !== null ? (
                  <button type="button" className={[styles.shortcut, styles.clear].join(' ')} onClick={() => pick(null)}>
                    Effacer
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        );
      }}
    </PopoverField>
  );
}

function rangeText(from: string | null, to: string | null): string {
  if (from && to) return from === to ? `Le ${formatDateCompact(from)}` : `Du ${formatDateCompact(from)} au ${formatDateCompact(to)}`;
  if (from) return `Depuis le ${formatDateCompact(from)}`;
  return '';
}

/** Période en deux clics dans un même calendrier. */
export function DateRangeField({ from, to, onChange, placeholder = 'Choisir des dates', min, max, ...rest }: DateRangeFieldProps) {
  return (
    <PopoverField {...rest} placeholder={placeholder} filled={from !== null} text={rangeText(from, to)}>
      {(close) => (
        <Calendar
          mode="range"
          from={from}
          to={to}
          min={min}
          max={max}
          onRange={(next) => {
            onChange(next);
            if (next.from && next.to && next.from !== next.to) close();
          }}
        />
      )}
    </PopoverField>
  );
}
