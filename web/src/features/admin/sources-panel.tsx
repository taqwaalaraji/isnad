"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { ActionResult } from "@/lib/errors";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { createSource, deleteSource, proposeExistingSource, setSourceStatus, type SourceInput, updateSource } from "./actions";
import type { PrivateSource } from "./queries";

const FREQUENCIES = ["manual", "daily", "weekly", "monthly", "quarterly", "annual", "irregular"] as const;
type Frequency = (typeof FREQUENCIES)[number];

type Editing = { mode: "create" } | { mode: "edit"; source: PrivateSource } | { mode: "propose"; source?: PrivateSource };

const HEALTH: Record<string, { tone: "match" | "context" | "differs" | "neutral"; icon: "check" | "alert" | "x" | "clock" }> = {
  healthy: { tone: "match", icon: "check" },
  warning: { tone: "context", icon: "alert" },
  failing: { tone: "differs", icon: "x" },
  unknown: { tone: "neutral", icon: "clock" },
};

function frequencyOf(value: string | null): Frequency {
  return FREQUENCIES.includes(value as Frequency) ? (value as Frequency) : "manual";
}

export function SourcesPanel({ sources, proposals }: { sources: PrivateSource[]; proposals: PrivateSource[] }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<PrivateSource | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        after?.();
      } else toast.error(t(res.error));
    });
  }

  const name = (s: PrivateSource) => (locale === "ar" ? s.name_ar : s.name_en);

  return (
    <>
      <div className="-mt-2 mb-4 flex flex-wrap justify-end gap-2">
        <Button icon="upload" onClick={() => setEditing({ mode: "propose" })}>
          {t("admin.privateSources.propose")}
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setEditing({ mode: "create" })}>
          {t("admin.privateSources.add")}
        </Button>
      </div>

      <p className="mb-4 flex items-start gap-2 rounded-md bg-accent-soft/60 px-4 py-3 text-sm">
        <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-accent" />
        {t("admin.privateSources.sharedNote")}
      </p>

      <Card className="overflow-x-auto">
        {sources.length === 0 ? (
          <EmptyState
            icon={<Icon name="folder" size={28} />}
            title={t("admin.privateSources.empty")}
            body={t("admin.privateSources.emptyBody")}
            action={
              <Button variant="primary" icon="plus" onClick={() => setEditing({ mode: "create" })}>
                {t("admin.privateSources.add")}
              </Button>
            }
          />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken/50 text-xs text-muted">
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.privateSources.source")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.privateSources.tier")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.privateSources.frequency")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.privateSources.documents")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.privateSources.updated")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("admin.privateSources.health")}</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const paused = s.status === "paused";
                const health = HEALTH[s.health] ?? HEALTH.unknown;
                const updated = s.lastDocumentAt ?? s.last_fetched_at ?? s.updated_at;
                return (
                  <tr key={s.id} className={cn("border-b border-border last:border-0", paused && "bg-surface-sunken/40")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-muted">
                          <Icon name="building" size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className={cn("truncate font-medium", paused && "text-muted")}>{name(s)}</p>
                          <p className="truncate text-xs text-muted" dir="ltr">
                            {s.domains[0] ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={s.tier === 3 ? "outline" : "neutral"} size="sm">
                        {t(`tier.${String(s.tier) as "1" | "2" | "3"}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{t(`admin.privateSources.frequencies.${frequencyOf(s.update_frequency)}`)}</td>
                    <td className="num px-4 py-3 font-semibold">{formatNumber(s.documents, locale)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatRelative(updated, locale)}</td>
                    <td className="px-4 py-3">
                      {paused ? (
                        <Badge tone="outline" size="sm" icon="pause">
                          {t("admin.privateSources.paused")}
                        </Badge>
                      ) : (
                        <Badge tone={health.tone} size="sm" icon={health.icon}>
                          {t(`admin.privateSources.healthStates.${s.health}`)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Menu>
                        <MenuTrigger asChild>
                          <IconButton icon="more" size="sm" label={t("common.actions")} />
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon="edit" onSelect={() => setEditing({ mode: "edit", source: s })}>
                            {t("common.edit")}
                          </MenuItem>
                          <MenuItem
                            icon={paused ? "play" : "pause"}
                            onSelect={() =>
                              run(
                                () => setSourceStatus(s.id, paused ? "active" : "paused"),
                                paused ? t("admin.privateSources.resumed") : t("admin.privateSources.pausedToast"),
                              )
                            }
                          >
                            {paused ? t("admin.privateSources.resume") : t("admin.privateSources.pause")}
                          </MenuItem>
                          <MenuItem icon="upload" onSelect={() => setEditing({ mode: "propose", source: s })}>
                            {t("admin.privateSources.propose")}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon="trash" danger onSelect={() => setDeleting(s)}>
                            {t("common.delete")}
                          </MenuItem>
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

      {proposals.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">{t("admin.privateSources.proposals")}</h2>
          <div className="space-y-3">
            {proposals.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t("admin.privateSources.proposalTitle", { name: name(p) })}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[t("admin.privateSources.sentOn", { date: formatDate(p.created_at, locale) }), p.homepage_url].filter(Boolean).join(" · ")}
                  </p>
                  {p.proposal_note && <p className="mt-1.5 text-sm text-muted">{p.proposal_note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {p.status === "rejected" ? (
                    <Badge tone="differs" size="sm" icon="x">
                      {t("admin.privateSources.rejected")}
                    </Badge>
                  ) : (
                    <Badge tone="context" size="sm" icon="clock">
                      {t("admin.privateSources.underReview")}
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteSource(p.id), t("admin.privateSources.withdrawn"))}>
                    {p.status === "rejected" ? t("common.remove") : t("admin.privateSources.withdraw")}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {editing && <SourceDialog editing={editing} onClose={() => setEditing(null)} />}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        {deleting && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("admin.privateSources.deleteTitle", { name: name(deleting) })}
            description={deleting.documents > 0 ? t("admin.errors.sourceHasDocuments") : t("admin.privateSources.deleteBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDeleting(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  icon="trash"
                  loading={pending}
                  disabled={deleting.documents > 0}
                  onClick={() => run(() => deleteSource(deleting.id), t("admin.privateSources.deleted"), () => setDeleting(null))}
                >
                  {t("common.delete")}
                </Button>
              </>
            }
          />
        )}
      </Dialog>
    </>
  );
}

function SourceDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { t } = useI18n();
  const source = editing.mode === "create" ? undefined : editing.source;
  const proposing = editing.mode === "propose";
  const fromExisting = proposing && !!source;
  const [value, setValue] = useState<SourceInput>({
    nameAr: source?.name_ar ?? "",
    nameEn: source?.name_en ?? "",
    homepage: source?.homepage_url ?? "",
    tier: source?.tier ?? 2,
    frequency: frequencyOf(source?.update_frequency ?? null),
    description: source?.description_ar ?? "",
    note: "",
  });
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof SourceInput>(key: K, v: SourceInput[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  function submit() {
    startTransition(async () => {
      const res =
        editing.mode === "edit"
          ? await updateSource(editing.source.id, value)
          : fromExisting
            ? await proposeExistingSource(source!.id, value.note ?? "")
            : await createSource(value, proposing);
      if (res.ok) {
        toast.success(proposing ? t("admin.privateSources.proposedToast") : t("common.saved"));
        onClose();
      } else toast.error(t(res.error));
    });
  }

  const title = proposing ? t("admin.privateSources.proposeTitle") : editing.mode === "edit" ? t("admin.privateSources.editTitle") : t("admin.privateSources.add");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        closeLabel={t("common.close")}
        title={title}
        description={proposing ? t("admin.privateSources.proposeBody") : t("admin.privateSources.addBody")}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" icon={proposing ? "send" : "check"} loading={pending} onClick={submit}>
              {proposing ? t("admin.privateSources.sendProposal") : t("common.save")}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset disabled={fromExisting} className="space-y-4 disabled:opacity-70">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("admin.privateSources.nameAr")} htmlFor="source-name-ar">
                <Input id="source-name-ar" value={value.nameAr} onChange={(e) => set("nameAr", e.target.value)} dir="rtl" required />
              </Field>
              <Field label={t("admin.privateSources.nameEn")} htmlFor="source-name-en">
                <Input id="source-name-en" value={value.nameEn} onChange={(e) => set("nameEn", e.target.value)} dir="ltr" required />
              </Field>
            </div>
            <Field label={t("admin.privateSources.homepage")} htmlFor="source-url" hint={proposing ? undefined : t("common.optional")}>
              <Input id="source-url" type="url" dir="ltr" placeholder="https://" value={value.homepage} onChange={(e) => set("homepage", e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("admin.privateSources.tier")} htmlFor="source-tier" hint={t(`admin.privateSources.tierHint.${String(value.tier) as "1" | "2" | "3"}`)}>
                <Select id="source-tier" value={value.tier} onChange={(e) => set("tier", Number(e.target.value))}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {t(`tier.${String(n) as "1" | "2" | "3"}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("admin.privateSources.frequency")} htmlFor="source-frequency">
                <Select id="source-frequency" value={value.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {t(`admin.privateSources.frequencies.${f}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {!proposing && (
              <Field label={t("admin.privateSources.description")} htmlFor="source-description" hint={t("common.optional")}>
                <Textarea id="source-description" rows={2} value={value.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            )}
          </fieldset>
          {proposing && (
            <Field label={t("admin.privateSources.proposalNote")} htmlFor="source-note">
              <Textarea id="source-note" rows={3} value={value.note} onChange={(e) => set("note", e.target.value)} />
            </Field>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
