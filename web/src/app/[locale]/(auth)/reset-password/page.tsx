import { Suspense } from "react";

import { NewPassword, RequestReset } from "@/features/auth/reset-password";
import { getViewer } from "@/lib/auth";

// Signed in (arriving from the reset email) → choose a new password; otherwise request a link.
async function Content() {
  const viewer = await getViewer();
  return viewer ? <NewPassword /> : <RequestReset />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
