import { DayPicker, type ClassNames, type DateRange } from '@daypicker/react';
import { fr } from '@daypicker/react/locale/fr';
import { parts, toISODate } from '@shared/dates';
import styles from './DateField.module.css';

/**
 * Grille du calendrier, chargée à la demande par `DateField` : DayPicker et ses dépendances
 * de dates restent hors du paquet principal tant qu'aucun calendrier n'est ouvert.
 */

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

type Bounds = { min?: string; max?: string };

function disabled({ min, max }: Bounds) {
  return [...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])];
}

export type CalendarProps = Bounds &
  (
    | { mode: 'single'; value: string | null; onPick: (iso: string) => void }
    | { mode: 'range'; from: string | null; to: string | null; onRange: (range: { from: string | null; to: string | null }) => void }
  );

export default function Calendar(props: CalendarProps) {
  const common = {
    locale: fr,
    weekStartsOn: 1 as const,
    navLayout: 'around' as const,
    showOutsideDays: true,
    autoFocus: true,
    disabled: disabled(props),
    classNames: CALENDAR_CLASSES,
  };

  if (props.mode === 'single') {
    return (
      <DayPicker
        {...common}
        mode="single"
        selected={props.value ? toDate(props.value) : undefined}
        defaultMonth={props.value ? toDate(props.value) : new Date()}
        onSelect={(d) => d && props.onPick(toISODate(d))}
      />
    );
  }

  return (
    <DayPicker
      {...common}
      mode="range"
      selected={props.from ? { from: toDate(props.from), to: props.to ? toDate(props.to) : undefined } : undefined}
      defaultMonth={props.from ? toDate(props.from) : new Date()}
      onSelect={(range: DateRange | undefined) => props.onRange({ from: range?.from ? toISODate(range.from) : null, to: range?.to ? toISODate(range.to) : null })}
    />
  );
}
