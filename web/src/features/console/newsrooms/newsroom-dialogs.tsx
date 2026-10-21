"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { createNewsroom, inviteNewsroomAdmin, updateNewsroom } from "../actions";
import { slugify } from "../domains";
import type { NewsroomRow } from "../queries";

function ErrorNote({ error }: { error: MessageKey | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 rounded-md bg-differ-tint px-3 py-2 text-sm text-differ-text">
      {t(error)}
    </p>
  );
}

function parseLimit(value: string): number | null | "invalid" {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : "invalid";
}

export function CreateNewsroom() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<"newsroom" | "issuer">("newsroom");
  const [limit, setLimit] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const monthlyCheckLimit = parseLimit(limit);
    if (monthlyCheckLimit === "invalid") return setError("console.newsrooms.errors.form");
    startTransition(async () => {
      const res = await createNewsroom({ name, slug, kind, monthlyCheckLimit, adminEmail, adminName, locale });
      if (!res.ok) return setError(res.error);
      if (res.data?.emailed) toast.success(t("console.newsrooms.created"));
      else toast.warning(t("console.newsrooms.createdNotEmailed"));
      setOpen(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setLimit("");
      setAdminEmail("");
      setAdminName("");
    });
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
        {t("console.newsrooms.create")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            closeLabel={t("common.close")}
            title={t("console.newsrooms.createTitle")}
            description={t("console.newsrooms.createBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" icon="send" loading={pending} disabled={!name.trim() || !slug.trim() || !adminEmail.trim()} onClick={submit}>
                  {t("console.newsrooms.create")}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("console.newsrooms.name")} htmlFor="nr-name" className="sm:col-span-2">
                <Input
                  id="nr-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                />
              </Field>
              <Field label={t("console.newsrooms.slug")} htmlFor="nr-slug" hint={t("console.newsrooms.slugHint")}>
                <Input
                  id="nr-slug"
                  dir="ltr"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                />
              </Field>
              <Field label={t("console.newsrooms.kindLabel")} htmlFor="nr-kind">
                <Select id="nr-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <option value="newsroom">{t("console.newsrooms.kinds.newsroom")}</option>
                  <option value="issuer">{t("console.newsrooms.kinds.issuer")}</option>
                </Select>
              </Field>
              <Field label={t("console.newsrooms.limit")} htmlFor="nr-limit" hint={t("console.newsrooms.limitHint")}>
                <Input id="nr-limit" dir="ltr" inputMode="numeric" className="num" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field>
              <div className="hidden sm:block" />
              <Field label={t("console.newsrooms.adminName")} htmlFor="nr-admin-name">
                <Input id="nr-admin-name" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
              </Field>
              <Field label={t("console.newsrooms.adminEmail")} htmlFor="nr-admin-email">
                <Input id="nr-admin-email" dir="ltr" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </Field>
            </div>
            <ErrorNote error={error} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function NewsroomMenu({ room }: { room: NewsroomRow }) {
  const { t, locale } = useI18n();
  const [dialog, setDialog] = useState<"edit" | "invite" | null>(null);
  const [limit, setLimit] = useState(room.monthly_check_limit ? String(room.monthly_check_limit) : "");
  const [status, setStatus] = useState<"active" | "suspended">(room.status === "suspended" ? "suspended" : "active");
  const [email, setEmail] = useState(room.invitedAdmin ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const monthlyCheckLimit = parseLimit(limit);
    if (monthlyCheckLimit === "invalid") return setError("console.newsrooms.errors.form");
    startTransition(async () => {
      const res = await updateNewsroom(room.id, { monthlyCheckLimit, status });
      if (!res.ok) return setError(res.error);
      toast.success(t("console.newsrooms.saved"));
      setDialog(null);
    });
  }

  function invite() {
    setError(null);
    startTransition(async () => {
      const res = await inviteNewsroomAdmin(room.id, email, name, locale);
      if (!res.ok) return setError(res.error);
      if (res.data?.emailed) toast.success(t("console.newsrooms.inviteSent"));
      else toast.warning(t("console.newsrooms.inviteNotEmailed"));
      setDialog(null);
    });
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon="more" size="sm" label={t("common.actions")} />
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon="edit" onSelect={() => setDialog("edit")}>
            {t("console.newsrooms.edit")}
          </MenuItem>
          <MenuItem icon="mail" onSelect={() => setDialog("invite")}>
            {t("console.newsrooms.inviteAdmin")}
          </MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "edit" && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("console.newsrooms.editTitle", { name: room.name })}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" icon="check" loading={pending} onClick={save}>
                  {t("common.save")}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label={t("console.newsrooms.limit")} htmlFor={`limit-${room.id}`} hint={t("console.newsrooms.limitHint")}>
                <Input id={`limit-${room.id}`} dir="ltr" inputMode="numeric" className="num" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field>
              <Field label={t("console.newsrooms.statusLabel")} htmlFor={`status-${room.id}`}>
                <Select id={`status-${room.id}`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  <option value="active">{t("console.newsrooms.status.active")}</option>
                  <option value="suspended">{t("console.newsrooms.status.suspended")}</option>
                </Select>
              </Field>
            </div>
            <ErrorNote error={error} />
          </DialogContent>
        )}
        {dialog === "invite" && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("console.newsrooms.inviteAdmin")}
            description={room.name}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" icon="send" loading={pending} disabled={!email.trim()} onClick={invite}>
                  {t("console.newsrooms.inviteAdmin")}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label={t("console.newsrooms.adminName")} htmlFor={`inv-name-${room.id}`}>
                <Input id={`inv-name-${room.id}`} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t("console.newsrooms.adminEmail")} htmlFor={`inv-email-${room.id}`}>
                <Input id={`inv-email-${room.id}`} dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <ErrorNote error={error} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
