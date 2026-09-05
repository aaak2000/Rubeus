import { hebrewDateService } from '@hcal/core';
import { hebrewMonthName, hebrewYearText } from '../hebrew';

interface Props {
  hebrewYear: number;
  /** ISO date of the currently selected day, to highlight its month. */
  selected: string | null;
  onSelectMonth: (hebrewMonth: number) => void;
}

/**
 * An overview of a whole Hebrew year — 12 months, or 13 in a leap year.
 * Useful for orienting around yahrzeits and festivals, which live on the
 * Hebrew calendar rather than the Gregorian one.
 */
export function HebrewYearView({ hebrewYear, selected, onSelectMonth }: Props) {
  const isLeap = hebrewDateService.isLeapYear(hebrewYear);
  const monthCount = hebrewDateService.monthsInYear(hebrewYear);
  // Hebrew years run Tishrei (7) → Elul (6); order the cards that way.
  const order = isLeap
    ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
    : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

  const selectedMonth = selected ? hebrewDateService.fromGregorian(selected).hebrew : null;

  return (
    <div className="year-view">
      <p className="year-caption muted text-sm">
        שנת {hebrewYearText(hebrewYear)} · {monthCount} חודשים{isLeap ? ' (שנה מעוברת)' : ''}
      </p>
      <div className="year-grid">
        {order.map((m) => {
          const first = hebrewDateService.fromHebrew(hebrewYear, m, 1);
          const days = hebrewDateService.daysInMonth(m, hebrewYear);
          const isCurrent = selectedMonth?.month === m && selectedMonth?.year === hebrewYear;
          return (
            <button
              key={m}
              type="button"
              className={`year-month${isCurrent ? ' is-current' : ''}`}
              onClick={() => onSelectMonth(m)}
            >
              <span className="year-month-name">{hebrewMonthName(m, hebrewYear)}</span>
              <span className="year-month-meta">{days} ימים</span>
              <span className="year-month-greg">{first.gregorian}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
