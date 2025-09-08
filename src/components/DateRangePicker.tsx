"use client";

import * as React from "react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

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
  const [range, setRange] = React.useState<DateRange | undefined>(
    startDate && endDate
      ? { from: new Date(startDate), to: new Date(endDate) }
      : undefined
  );

  const handleSelect = (selected: DateRange | undefined) => {
    setRange(selected);
    const start = selected?.from ? format(selected.from, "yyyy-MM-dd") : "";
    const end = selected?.to ? format(selected.to, "yyyy-MM-dd") : "";
    onChange(start, end);
  };

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={cn(
            "w-[260px] px-4 py-2 border rounded-md bg-white text-left font-normal",
            !range && "text-muted-foreground",
            className
          )}
        >
          {range?.from
            ? range.to
              ? `${format(range.from, "MMM d, yyyy")} - ${format(
                  range.to,
                  "MMM d, yyyy"
                )}`
              : format(range.from, "MMM d, yyyy")
            : "Pick a date range"}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="start"
        className="p-2 bg-white rounded-md shadow-md border"
      >
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={1}
        />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}

