"use client";

import { cn } from "./cn";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-surface-sunken p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-sm font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === option.value ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
