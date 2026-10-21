"use client";

import { Switch as RadixSwitch } from "radix-ui";

import { cn } from "./cn";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  name,
  defaultChecked,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  name?: string;
}) {
  return (
    <RadixSwitch.Root
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      name={name}
      aria-label={label}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        "bg-border-strong data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <RadixSwitch.Thumb
        className={cn(
          "block size-5 rounded-full bg-white shadow-card transition-transform",
          "translate-x-0.5 data-[state=checked]:translate-x-[22px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[22px]",
        )}
      />
    </RadixSwitch.Root>
  );
}
