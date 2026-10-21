import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/card";
import { InviteView } from "@/features/invitations/invite-view";
import type { InvitationPreview } from "@/features/invitations/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

async function Invite({ params }: { params: PageProps<"/[locale]/invite/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  const supabase = await createClient();
  const valid = /^[0-9a-f]{48}$/.test(token);
  const [{ data: claims }, { data }] = await Promise.all([
    supabase.auth.getClaims(),
    valid ? supabase.rpc("invitation_preview", { raw_token: token }) : Promise.resolve({ data: null }),
  ]);
  const preview = (data as InvitationPreview | null) ?? { state: "invalid" as const };
  const metadata = claims?.claims?.user_metadata as { needs_password?: boolean } | undefined;
  return <InviteView token={token} preview={preview} needsPassword={metadata?.needs_password === true} signedIn={!!claims?.claims?.sub} />;
}

export default function InvitePage({ params }: PageProps<"/[locale]/invite/[token]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Invite params={params} />
    </Suspense>
  );
}
