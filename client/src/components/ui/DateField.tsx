import { DayPicker, type ClassNames, type DateRange } from '@daypicker/react';
import { fr } from '@daypicker/react/locale/fr';
import { ChevronDown } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode, type ToggleEvent } from 'react';
import { addDays, formatDateWithWeekday, parts, today, toISODate } from '@shared/dates';
import { formatDateCompact } from '@/lib/format';
import styles from './DateField.module.css';

type Variant = 'line' | 'pill';

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

const CALENDAR_CLASSES: Partial<ClassNames> = {
  root: styles.calendar,
  months: styles.months,
  month: styles.month,
  month_caption: styles.caption,
  caption_label: styles.captionLabel,
  nav: styles.nav,
  button_previous: styles.navButton,
  button_next: styles.navButton,
  chevron: styles.chevron,
  month_grid: styles.grid,
  weekdays: styles.weekdays,
  weekday: styles.weekday,
  week: styles.week,
  day: styles.day,
  day_button: styles.dayButton,
  today: styles.today,
  selected: styles.selected,
  outside: styles.outside,
  disabled: styles.disabled,
  hidden: styles.hidden,
  range_start: styles.rangeStart,
  range_middle: styles.rangeMiddle,
  range_end: styles.rangeEnd,
};

function toDate(iso: string): Date {
  const { year, month, day } = parts(iso);
  return new Date(year, month - 1, day);
}

function bounds(min?: string, max?: string) {
  return [...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])];
}

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
        {open ? children(close) : null}
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
            <DayPicker
              mode="single"
              locale={fr}
              weekStartsOn={1}
              navLayout="around"
              showOutsideDays
              autoFocus
              selected={value ? toDate(value) : undefined}
              defaultMonth={value ? toDate(value) : new Date()}
              disabled={bounds(min, max)}
              onSelect={(d) => d && pick(toISODate(d))}
              classNames={CALENDAR_CLASSES}
            />
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
        <DayPicker
          mode="range"
          locale={fr}
          weekStartsOn={1}
          navLayout="around"
          showOutsideDays
          autoFocus
          selected={from ? { from: toDate(from), to: to ? toDate(to) : undefined } : undefined}
          defaultMonth={from ? toDate(from) : new Date()}
          disabled={bounds(min, max)}
          onSelect={(range: DateRange | undefined) => {
            const next = { from: range?.from ? toISODate(range.from) : null, to: range?.to ? toISODate(range.to) : null };
            onChange(next);
            if (next.from && next.to && next.from !== next.to) close();
          }}
          classNames={CALENDAR_CLASSES}
        />
      )}
    </PopoverField>
  );
}
