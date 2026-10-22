"use client";

import { ErrorState } from "@/components/states/error-state";

/** Inside the workspace shell, so the sidebar stays and the person can move on. */
export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} />;
}
