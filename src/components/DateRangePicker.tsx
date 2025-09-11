"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import RangeCalendar, { RangeValue } from "./RangeCalendar";

type DateRangePickerProps = {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  className?: string;
};

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
}: DateRangePickerProps) {
  const parsed = React.useMemo<RangeValue>(
    () => ({
      start: startDate ? new Date(startDate) : null,
      end: endDate ? new Date(endDate) : null,
    }),
    [startDate, endDate]
  );

  const [range, setRange] = React.useState<RangeValue>(parsed);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setRange(parsed), [parsed.start?.getTime(), parsed.end?.getTime()]);

  const formatIso = (d: Date) => d.toISOString().slice(0, 10);
  const formatDisplay = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const handleChange = (next: RangeValue) => {
    setRange(next);
    const start = next.start ? formatIso(next.start) : "";
    const end = next.end ? formatIso(next.end) : "";
    onChange(start, end);
    if (next.start && next.end) setOpen(false);
  };

  const label = range.start
    ? range.end
      ? `${formatDisplay(range.start)} - ${formatDisplay(range.end)}`
      : formatDisplay(range.start)
    : "Select date range";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={cn(
            "w-[260px] px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-left",
            !range.start && "text-gray-400",
            className
          )}
        >
          {label}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="start"
        className="p-2 bg-white rounded-md shadow-md border"
      >
        <RangeCalendar value={range} onChange={handleChange} />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}

