"use client";

import * as React from "react";
import { DateRange } from "react-day-picker";
import { format, parse } from "date-fns";
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
      ? {
          from: parse(startDate, "yyyy-MM-dd", new Date()),
          to: parse(endDate, "yyyy-MM-dd", new Date()),
        }
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
            "w-[260px] px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-left",
            !range && "text-gray-400",
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
            : "Select date range"}
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
          classNames={{
            day_selected:
              "bg-[#2CA01C] text-white hover:bg-[#2CA01C] hover:text-white",
            day_range_start:
              "day-range-start bg-[#2CA01C] text-white",
            day_range_end:
              "day-range-end bg-[#2CA01C] text-white",
            day_range_middle: "aria-selected:bg-[#E3F7EC]",
            day_today: "text-[#2CA01C] font-semibold",
          }}
        />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}

