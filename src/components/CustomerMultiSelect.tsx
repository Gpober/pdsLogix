"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  label?: string;
  options: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  allLabel?: string;
  accentColor?: string;
}

export default function CustomerMultiSelect({
  label = "Customers",
  options,
  selected,
  onChange,
  allLabel = "All Customers",
  accentColor = "#56B6E9",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleOption = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) {
      next.delete(opt);
    } else {
      next.add(opt);
    }
    if (opt === allLabel) {
      next.clear();
      next.add(allLabel);
    } else {
      next.delete(allLabel);
      if (next.size === 0) next.add(allLabel);
    }
    onChange(next);
  };

  const selectAll = () => {
    const visible = filtered.filter((o) => o !== allLabel);
    if (visible.length === 0) return;
    const next = new Set(selected);
    visible.forEach((o) => next.add(o));
    next.delete(allLabel);
    onChange(next);
  };

  const clearAll = () => {
    const next = new Set<string>();
    next.add(allLabel);
    onChange(next);
  };

  const displayLabel = () => {
    if (selected.has(allLabel) || selected.size === 0) return allLabel;
    const arr = Array.from(selected);
    return arr.length > 1 ? `${arr[0]} +${arr.length - 1}` : arr[0];
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ "--tw-ring-color": accentColor + "33" } as React.CSSProperties}
      >
        {label}: {displayLabel()}
        <ChevronDown className="w-4 h-4 ml-2" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-1 border border-gray-300 rounded"
            />
            <div className="flex justify-between mt-2">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={selectAll}
              >
                Select All
              </button>
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={clearAll}
              >
                Clear
              </button>
            </div>
          </div>
          {filtered.map((opt) => (
            <label
              key={opt}
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggleOption(opt)}
                className="mr-3 rounded"
                style={{ accentColor }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

