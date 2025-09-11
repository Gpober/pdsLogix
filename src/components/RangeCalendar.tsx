import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export type RangeValue = { start: Date | null; end: Date | null };

export type RangeCalendarProps = {
  value?: RangeValue;
  defaultValue?: RangeValue;
  onChange?: (next: RangeValue) => void;
  minDate?: Date;
  maxDate?: Date;
  initialMonth?: Date;
  weekStartsOn?: 0 | 1;
  highlightColorClass?: string;
  rangeFillClass?: string;
  className?: string;
};

// --- Date helpers ---------------------------------------------------------

/** Returns a new date at the start of the month */
function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Adds months to a date */
function addMonths(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

/** Adds days to a date */
function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

/** Checks if two dates fall on the same day */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Whether a date lies strictly between start and end */
function isBetween(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime();
  return time > start.getTime() && time < end.getTime();
}

/** Builds a 6x7 matrix of dates for a given month */
function getMonthMatrix(month: Date, weekStartsOn: 0 | 1): Date[][] {
  const firstOfMonth = startOfMonth(month);
  const firstWeekday = (firstOfMonth.getUTCDay() - weekStartsOn + 7) % 7;
  const matrix: Date[][] = [];
  const current = addDays(firstOfMonth, -firstWeekday);

  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    matrix.push(week);
  }
  return matrix;
}

// --- Component ------------------------------------------------------------

const RangeCalendar: React.FC<RangeCalendarProps> = ({
  value,
  defaultValue = { start: null, end: null },
  onChange,
  minDate,
  maxDate,
  initialMonth,
  weekStartsOn = 0,
  highlightColorClass = "bg-[var(--accent)] text-white",
  rangeFillClass = "bg-[color:rgb(46_134_193/0.18)]",
  className,
}) => {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<RangeValue>(defaultValue);
  const range = isControlled ? value! : internal;

  const today = startOfDay(new Date());
  const initial = initialMonth
    ? startOfMonth(initialMonth)
    : range.start
    ? startOfMonth(range.start)
    : startOfMonth(today);
  const [month, setMonth] = React.useState<Date>(initial);
  const [focusedDate, setFocusedDate] = React.useState<Date>(range.start || today);
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  // for announcing month changes
  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const matrix = React.useMemo(() => getMonthMatrix(month, weekStartsOn), [month, weekStartsOn]);

  const isDisabled = React.useCallback(
    (date: Date) => {
      if (minDate && date < startOfDay(minDate)) return true;
      if (maxDate && date > startOfDay(maxDate)) return true;
      return false;
    },
    [minDate, maxDate]
  );

  // normalizes date to midnight
  function startOfDay(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  const commit = (next: RangeValue) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  const selectDate = (day: Date) => {
    if (isDisabled(day)) return;
    const { start, end } = range;

    if (!start || (start && end) || (start && isSameDay(day, start)) || day < start) {
      // start new range
      commit({ start: day, end: null });
    } else if (!end && day >= start) {
      // complete range
      commit({ start, end: day });
    }
    setHoverDate(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    date: Date
  ) => {
    let newFocus = new Date(date);
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        newFocus = addDays(date, -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        newFocus = addDays(date, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        newFocus = addDays(date, -7);
        break;
      case "ArrowDown":
        e.preventDefault();
        newFocus = addDays(date, 7);
        break;
      case "Enter":
        e.preventDefault();
        selectDate(date);
        return;
      case "Escape":
        e.preventDefault();
        setHoverDate(null);
        return;
      default:
        return;
    }
    if (
      newFocus.getUTCMonth() !== month.getUTCMonth() ||
      newFocus.getUTCFullYear() !== month.getUTCFullYear()
    ) {
      setMonth(startOfMonth(newFocus));
    }
    if (!isDisabled(newFocus)) setFocusedDate(newFocus);
    if (range.start && !range.end) setHoverDate(newFocus);
  };

  const monthNext = () => setMonth(addMonths(month, 1));
  const monthPrev = () => setMonth(addMonths(month, -1));

  const effectiveEnd = React.useMemo(() => {
    if (range.end) return range.end;
    if (range.start && hoverDate && hoverDate.getTime() > range.start.getTime())
      return hoverDate;
    return null;
  }, [range.end, range.start, hoverDate]);

  return (
    <div
      className={cn("w-full max-w-xs select-none", className)}
      style={{ "--accent": "#2E86C1" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-2">{/* Header */}
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100"
          aria-label="Previous month"
          onClick={monthPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium text-center flex-1">
          {month.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })}
        </div>
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100"
          aria-label="Next month"
          onClick={monthNext}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div aria-live="polite" className="sr-only">
        {monthLabel}
      </div>

      <div className="mt-2 grid grid-cols-7 text-xs text-center">{/* Weekdays */}
        {weekStartsOn === 1
          ? ["M", "T", "W", "T", "F", "S", "S"].map((_, i) => {
              const base = ["S", "M", "T", "W", "T", "F", "S"];
              return (
                <div key={i} className="h-6 flex items-center justify-center">
                  {base[(i + 1) % 7]}
                </div>
              );
            })
          : ["S", "M", "T", "W", "T", "F", "S"].map((d) => (
              <div key={d} className="h-6 flex items-center justify-center">
                {d}
              </div>
            ))}
      </div>

      <div role="grid" className="grid grid-cols-7 grid-rows-6 text-sm">{/* Days */}
        {matrix.map((week) =>
          week.map((date) => {
            const isCurrentMonth =
              date.getUTCMonth() === month.getUTCMonth() &&
              date.getUTCFullYear() === month.getUTCFullYear();
            const disabled = isDisabled(date);
            const isStart = !!(range.start && isSameDay(date, range.start));
            const isEnd = !!(effectiveEnd && isSameDay(date, effectiveEnd));
            const inRange =
              range.start && effectiveEnd && isBetween(date, range.start, effectiveEnd);
            const isToday = isSameDay(date, today);
            const focused = isSameDay(date, focusedDate);

            const radiusClass = isStart && isEnd
              ? "rounded-full"
              : isStart
              ? "rounded-l-full"
              : isEnd
              ? "rounded-r-full"
              : "";

            const ariaLabel = date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            });

            return (
              <button
                key={date.toISOString()}
                type="button"
                role="gridcell"
                aria-label={ariaLabel}
                aria-selected={isStart || isEnd}
                tabIndex={focused ? 0 : -1}
                onKeyDown={(e) => handleKeyDown(e, date)}
                onFocus={() => setFocusedDate(date)}
                onMouseEnter={() => {
                  if (range.start && !range.end && !disabled && date >= range.start) {
                    setHoverDate(date);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                onClick={() => selectDate(date)}
                disabled={disabled}
                className={cn(
                  "relative h-10 w-10 flex items-center justify-center border border-gray-200 outline-none",
                  !isCurrentMonth && "text-gray-400/60",
                  disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:bg-gray-100",
                  isToday && "outline outline-1 outline-gray-400"
                )}
              >
                {inRange && <span className={cn("absolute inset-0", rangeFillClass)} />}
                {(isStart || isEnd) && (
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center justify-center",
                      highlightColorClass,
                      radiusClass
                    )}
                  />
                )}
                <span className={cn("relative z-10", (isStart || isEnd) && "text-white")}>{
                  date.getUTCDate()
                }</span>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-2 flex items-center text-xs text-gray-500">{/* Year selector */}
        <button
          type="button"
          className="flex-1 py-1 rounded hover:bg-gray-100"
          aria-label="Previous year"
          onClick={() => setMonth(addMonths(month, -12))}
        >
          {month.getUTCFullYear() - 1}
        </button>
        <div className="flex-1 text-center font-medium">{month.getUTCFullYear()}</div>
        <button
          type="button"
          className="flex-1 py-1 rounded hover:bg-gray-100"
          aria-label="Next year"
          onClick={() => setMonth(addMonths(month, 12))}
        >
          {month.getUTCFullYear() + 1}
        </button>
      </div>
    </div>
  );
};

export default RangeCalendar;

// Example:
// const [range, setRange] = useState<RangeValue>({ start: null, end: null });
// <RangeCalendar
//   value={range}
//   onChange={setRange}
//   initialMonth={new Date(Date.UTC(2025, 7, 1))} // August 2025
// />

