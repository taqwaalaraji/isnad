"use client";

import { useCheckRealtime } from "./use-realtime";

/** Keeps the server-rendered check page in sync with the worker and other reviewers. */
export function CheckRealtime({ checkId }: { checkId: string }) {
  useCheckRealtime(checkId);
  return null;
}
