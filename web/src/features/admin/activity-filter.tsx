"use client";

import { usePathname, useRouter } from "next/navigation";

import { Select } from "@/components/ui/field";

/** Narrows the activity log to one member (kept in the URL). */
export function ActivityFilter({
  members,
  userId,
  label,
  allLabel,
}: {
  members: Array<{ id: string; name: string }>;
  userId?: string;
  label: string;
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select
      aria-label={label}
      value={userId ?? ""}
      className="h-8 w-44 text-xs"
      onChange={(e) => router.push(e.target.value ? `${pathname}?user=${e.target.value}` : pathname)}
    >
      <option value="">{allLabel}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </Select>
  );
}
