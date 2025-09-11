"use client";

import { DayPicker, type NavProps } from "react-day-picker";
import { cn } from "@/lib/utils";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  className?: string;
  classNames?: {
    months?: string;
    month?: string;
    caption?: string;
    caption_label?: string;
    nav?: string;
    nav_button?: string;
    nav_button_previous?: string;
    nav_button_next?: string;
    table?: string;
    head_row?: string;
    head_cell?: string;
    row?: string;
    cell?: string;
    day?: string;
    day_selected?: string;
    day_today?: string;
    day_outside?: string;
    day_disabled?: string;
    day_range_start?: string;
    day_range_end?: string;
    day_range_middle?: string;
    day_hidden?: string;
  };
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 w-full max-w-2xl mx-auto", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground focus:outline-none"
        ),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside: "day-outside text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_start: "day-range-start bg-primary text-primary-foreground rounded-l-md",
        day_range_end: "day-range-end bg-primary text-primary-foreground rounded-r-md",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground day-range-middle bg-accent/50",
        day_hidden: "invisible",
        ...classNames,
      }}
      captionLayout="dropdown"
      fromYear={1900}
      toYear={2100}
      components={{
        Nav: (props: NavProps) => (
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={props.onPreviousClick}
              className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={props.onNextClick}
              className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ),
      }}
      {...props}
    />
  );
}

export { Calendar };
