import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getViewer, isStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false } };

/** Signed in, but not an active member of any newsroom (never invited, or deactivated). */
async function Content({ params }: PageProps<"/[locale]/no-newsroom">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([getViewer(), getT(locale)]);
  if (!viewer) redirect(`/${locale}/sign-in`);
  if (viewer.active) redirect(`/${locale}`);
  return (
    <div>
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-muted">
        <Icon name="users" size={20} />
      </span>
      <h1 className="text-2xl font-bold">{t("auth.noNewsroom.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("auth.errors.noNewsroom")}</p>
      <p className="mt-4 rounded-md bg-surface-sunken px-3 py-2 text-sm" dir="ltr">
        {viewer.email}
      </p>
      <p className="mt-4 text-sm text-muted">{t("auth.noNewsroom.hint")}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {isStaff(viewer) && (
          <ButtonLink href={`/${locale}/console/sources`} variant="primary" icon="shield">
            {t("nav.openConsole")}
          </ButtonLink>
        )}
        <form action="/auth/sign-out" method="post">
          <Button type="submit" icon="logout">
            {t("auth.noNewsroom.otherAccount")}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function NoNewsroomPage(props: PageProps<"/[locale]/no-newsroom">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Content {...props} />
    </Suspense>
  );
}
