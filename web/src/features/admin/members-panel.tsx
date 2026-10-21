"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, SearchInput, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { ActionResult } from "@/lib/errors";
import { formatDate, formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { normalizeAr } from "@/lib/text";

import { inviteMember, resendInvitation, revokeInvitation } from "../invitations/actions";
import { addDesk, deleteDesk, renameDesk, setMemberStatus, updateMember } from "./actions";
import type { MembersPageData } from "./queries";

type Role = "journalist" | "editor" | "admin";
type Tab = "members" | "desks" | "invitations";
type Member = MembersPageData["members"][number];
type Desk = MembersPageData["desks"][number];

const ROLE_TONE: Record<Role, "ink" | "accent" | "neutral"> = { admin: "ink", editor: "accent", journalist: "neutral" };

function useRun() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, success?: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        if (success) toast.success(success);
        after?.();
      } else toast.error(t(res.error));
    });
  }
  return { pending, run };
}

export function MembersPanel({ data, viewerId, initialTab }: { data: MembersPageData; viewerId: string; initialTab: Tab }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [inviteOpen, setInviteOpen] = useState(false);
  const activeCount = data.members.filter((m) => m.status === "active").length;

  const tabs: Array<[Tab, string, number]> = [
    ["members", t("admin.members.tabMembers"), activeCount],
    ["desks", t("admin.members.desks"), data.desks.length],
    ["invitations", t("admin.members.pending"), data.invitations.length],
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" className="flex gap-1">
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
                tab === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {label}
              <span className={cn("num rounded-full px-1.5 text-[11px]", tab === key ? "bg-accent text-on-accent" : "bg-surface-sunken text-muted")}>{count}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" icon="plus" className="mb-2" onClick={() => setInviteOpen(true)}>
          {t("admin.members.invite")}
        </Button>
      </div>

      {tab === "members" && <MembersTable members={data.members} desks={data.desks} viewerId={viewerId} />}
      {tab === "desks" && <DesksTable desks={data.desks} />}
      {tab === "invitations" && <InvitationsTable invitations={data.invitations} onInvite={() => setInviteOpen(true)} />}

      <p className="mt-4 flex items-start gap-2 rounded-md bg-surface-sunken px-4 py-3 text-xs text-muted">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
        {t("admin.members.rolesNote")}
      </p>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} desks={data.desks} />
    </>
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────

function MembersTable({ members, desks, viewerId }: { members: Member[]; desks: Desk[]; viewerId: string }) {
  const { t, locale } = useI18n();
  const [role, setRole] = useState<Role | "all">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [deactivating, setDeactivating] = useState<Member | null>(null);
  const { pending, run } = useRun();

  const counts = useMemo(() => {
    const c = { all: 0, admin: 0, editor: 0, journalist: 0 };
    for (const m of members) {
      if (m.status !== "active") continue;
      c.all++;
      c[m.role]++;
    }
    return c;
  }, [members]);

  const q = normalizeAr(query.trim());
  const visible = members.filter(
    (m) => (role === "all" || m.role === role) && (!q || normalizeAr(`${m.full_name} ${m.email}`).includes(q)),
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "admin", "editor", "journalist"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                role === r ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border bg-surface hover:border-border-strong",
              )}
            >
              {r === "all" ? t("common.all") : t(`admin.members.rolePlural.${r}`)}
              <span className={cn("num rounded-full px-1.5 text-xs", role === r ? "bg-white/15" : "bg-surface-sunken text-muted")}>{counts[r]}</span>
            </button>
          ))}
        </div>
        <SearchInput
          className="w-full sm:w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.members.searchPlaceholder")}
          aria-label={t("common.search")}
        />
      </div>

      <Card className="overflow-x-auto">
        {visible.length === 0 ? (
          <EmptyState icon={<Icon name="users" size={28} />} title={t("admin.members.noMatches")} />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken/50 text-xs text-muted">
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.member")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.role")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.desk")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.telegram")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.lastActive")}</th>
                <th className="w-12 px-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const inactive = m.status !== "active";
                const self = m.user_id === viewerId;
                return (
                  <tr key={m.user_id} className={cn("border-b border-border last:border-0", inactive && "bg-surface-sunken/40")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.full_name || m.email} size={32} className={cn(inactive && "opacity-50")} />
                        <div className="min-w-0">
                          <p className={cn("truncate font-medium", inactive && "text-muted")}>
                            {m.full_name || m.email}
                            {self && <span className="ms-1.5 text-xs font-normal text-muted">({t("common.you")})</span>}
                          </p>
                          <p className="truncate text-xs text-muted" dir="ltr">
                            {m.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {inactive ? (
                        <Badge tone="outline" size="sm">
                          {t("admin.members.deactivated")}
                        </Badge>
                      ) : (
                        <Badge tone={ROLE_TONE[m.role]} size="sm">
                          {t(`roles.${m.role}`)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{m.desk_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs", m.telegram_linked ? "text-text" : "text-subtle")}>
                        <Icon name="send" size={14} className={m.telegram_linked ? "text-accent" : ""} />
                        {m.telegram_linked ? t("admin.members.linked") : t("admin.members.notLinked")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{m.last_sign_in_at ? formatRelative(m.last_sign_in_at, locale) : t("admin.members.never")}</td>
                    <td className="px-2 py-3">
                      <Menu>
                        <MenuTrigger asChild>
                          <IconButton icon="more" size="sm" label={t("common.actions")} />
                        </MenuTrigger>
                        <MenuContent>
                          {!inactive && (
                            <MenuItem icon="edit" onSelect={() => setEditing(m)}>
                              {t("admin.members.edit")}
                            </MenuItem>
                          )}
                          {inactive ? (
                            <MenuItem icon="refresh" onSelect={() => run(() => setMemberStatus(m.user_id, "active"), t("admin.members.reactivated"))}>
                              {t("admin.members.reactivate")}
                            </MenuItem>
                          ) : (
                            <>
                              <MenuSeparator />
                              <MenuItem icon="lock" danger disabled={pending} onSelect={() => setDeactivating(m)}>
                                {t("admin.members.deactivate")}
                              </MenuItem>
                            </>
                          )}
                        </MenuContent>
                      </Menu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editing && <EditMemberDialog member={editing} desks={desks} onClose={() => setEditing(null)} />}

      <Dialog open={deactivating !== null} onOpenChange={(open) => !open && setDeactivating(null)}>
        {deactivating && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("admin.members.deactivateTitle", { name: deactivating.full_name || deactivating.email })}
            description={deactivating.user_id === viewerId ? t("admin.members.deactivateSelfBody") : t("admin.members.deactivateBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDeactivating(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  icon="lock"
                  loading={pending}
                  onClick={() => run(() => setMemberStatus(deactivating.user_id, "deactivated"), t("admin.members.deactivatedToast"), () => setDeactivating(null))}
                >
                  {t("admin.members.deactivate")}
                </Button>
              </>
            }
          />
        )}
      </Dialog>
    </>
  );
}

function EditMemberDialog({ member, desks, onClose }: { member: Member; desks: Desk[]; onClose: () => void }) {
  const { t } = useI18n();
  const [role, setRole] = useState<Role>(member.role);
  const [deskId, setDeskId] = useState(member.desk_id ?? "");
  const { pending, run } = useRun();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        closeLabel={t("common.close")}
        title={t("admin.members.editTitle", { name: member.full_name || member.email })}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={pending} onClick={() => run(() => updateMember(member.user_id, role, deskId || null), t("common.saved"), onClose)}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <RolePicker value={role} onChange={setRole} />
          <Field label={t("admin.members.desk")} htmlFor="member-desk">
            <Select id="member-desk" value={deskId} onChange={(e) => setDeskId(e.target.value)}>
              <option value="">{t("admin.members.noDesk")}</option>
              {desks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RolePicker({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  const { t } = useI18n();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{t("admin.members.role")}</legend>
      <div className="space-y-2">
        {(["journalist", "editor", "admin"] as const).map((r) => (
          <label
            key={r}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
              value === r ? "border-accent bg-accent-soft/40" : "border-border hover:border-border-strong",
            )}
          >
            <input type="radio" name="role" className="mt-0.5 size-4 accent-[var(--accent)]" checked={value === r} onChange={() => onChange(r)} />
            <span>
              <span className="block text-sm font-medium">{t(`roles.${r}`)}</span>
              <span className="block text-xs text-muted">{t(`admin.members.roleHint.${r}`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function InviteDialog({ open, onOpenChange, desks }: { open: boolean; onOpenChange: (open: boolean) => void; desks: Desk[] }) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("journalist");
  const [deskId, setDeskId] = useState("");
  const { pending, run } = useRun();

  function reset() {
    setEmail("");
    setFullName("");
    setRole("journalist");
    setDeskId("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      {open && (
        <DialogContent
          closeLabel={t("common.close")}
          title={t("admin.members.inviteTitle")}
          description={t("admin.members.inviteBody")}
          footer={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                icon="send"
                loading={pending}
                disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
                onClick={() =>
                  run(
                    () => inviteMember({ email, fullName, role, deskId: deskId || null, locale }),
                    t("admin.members.invited"),
                    () => {
                      onOpenChange(false);
                      reset();
                    },
                  )
                }
              >
                {t("admin.members.sendInvite")}
              </Button>
            </>
          }
        >
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("admin.members.email")} htmlFor="invite-email">
                <Input id="invite-email" type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label={t("admin.members.name")} htmlFor="invite-name">
                <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
            </div>
            <RolePicker value={role} onChange={setRole} />
            <Field label={t("admin.members.desk")} htmlFor="invite-desk">
              <Select id="invite-desk" value={deskId} onChange={(e) => setDeskId(e.target.value)}>
                <option value="">{t("admin.members.noDesk")}</option>
                {desks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Desks ────────────────────────────────────────────────────────────────────

function DesksTable({ desks }: { desks: Desk[] }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Desk | null>(null);
  const { pending, run } = useRun();

  return (
    <Card>
      <form
        className="flex flex-wrap gap-2 border-b border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) run(() => addDesk(name), t("admin.members.deskAdded"), () => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("admin.members.deskName")} aria-label={t("admin.members.deskName")} className="max-w-xs" />
        <Button type="submit" icon="plus" loading={pending && !renaming && !deleting} disabled={!name.trim()}>
          {t("admin.members.addDesk")}
        </Button>
      </form>
      {desks.length === 0 ? (
        <EmptyState icon={<Icon name="layers" size={28} />} title={t("admin.members.noDesks")} body={t("admin.members.desksHint")} />
      ) : (
        <ul>
          {desks.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
              {renaming?.id === d.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => renameDesk(d.id, renaming.name), t("common.saved"), () => setRenaming(null));
                  }}
                >
                  <Input value={renaming.name} onChange={(e) => setRenaming({ id: d.id, name: e.target.value })} autoFocus className="max-w-xs" aria-label={t("admin.members.deskName")} />
                  <Button type="submit" size="sm" variant="primary" loading={pending}>
                    {t("common.save")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    {t("common.cancel")}
                  </Button>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-sm bg-surface-sunken text-muted">
                      <Icon name="layers" size={16} />
                    </span>
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted">{t("admin.members.deskMembers", { n: d.members })}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <IconButton icon="edit" size="sm" label={t("common.edit")} onClick={() => setRenaming({ id: d.id, name: d.name })} />
                    <IconButton icon="trash" size="sm" label={t("common.delete")} onClick={() => setDeleting(d)} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        {deleting && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("admin.members.deleteDeskTitle", { name: deleting.name })}
            description={t("admin.members.deleteDeskBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDeleting(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="trash" loading={pending} onClick={() => run(() => deleteDesk(deleting.id), t("admin.members.deskDeleted"), () => setDeleting(null))}>
                  {t("common.delete")}
                </Button>
              </>
            }
          />
        )}
      </Dialog>
    </Card>
  );
}

// ─── Invitations ──────────────────────────────────────────────────────────────

function InvitationsTable({ invitations, onInvite }: { invitations: MembersPageData["invitations"]; onInvite: () => void }) {
  const { t, locale } = useI18n();
  const { pending, run } = useRun();
  const [now] = useState(() => Date.now());

  if (invitations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="mail" size={28} />}
          title={t("admin.members.noPending")}
          action={
            <Button variant="primary" icon="plus" onClick={onInvite}>
              {t("admin.members.invite")}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/50 text-xs text-muted">
            <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.email")}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.role")}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.invitedBy")}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t("admin.members.status")}</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => {
            const expired = new Date(inv.expires_at).getTime() < now;
            return (
              <tr key={inv.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium" dir="ltr">
                    {inv.email}
                  </p>
                  {inv.full_name && <p className="text-xs text-muted">{inv.full_name}</p>}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={ROLE_TONE[inv.role]} size="sm">
                    {t(`roles.${inv.role}`)}
                  </Badge>
                  {inv.desk?.name && <span className="ms-2 text-xs text-muted">{inv.desk.name}</span>}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {inv.inviter?.full_name ?? "—"} · {formatRelative(inv.created_at, locale)}
                </td>
                <td className="px-4 py-3 text-xs">
                  {expired ? (
                    <span className="text-differ-text">{t("admin.members.expired")}</span>
                  ) : (
                    <span className="text-muted">{t("admin.members.expires", { date: formatDate(inv.expires_at, locale) })}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" icon="refresh" disabled={pending} onClick={() => run(() => resendInvitation(inv.id, locale), t("admin.members.resent"))}>
                      {t("admin.members.resend")}
                    </Button>
                    <Button size="sm" variant="ghost" icon="x" disabled={pending} onClick={() => run(() => revokeInvitation(inv.id), t("admin.members.revoked"))}>
                      {t("admin.members.revoke")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
