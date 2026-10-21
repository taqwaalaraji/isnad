import type { Database } from "@/lib/database.types";

export type InvitationState = "open" | "signed_out" | "wrong_account" | "expired" | "used" | "invalid";

/** What `invitation_preview` returns. */
export type InvitationPreview = {
  state: InvitationState;
  newsroom_id?: string;
  newsroom_name?: string;
  role?: Database["public"]["Enums"]["member_role"];
  desk_name?: string | null;
  invited_by?: string | null;
  full_name?: string;
  email?: string;
  created_at?: string;
  expires_at?: string;
};
