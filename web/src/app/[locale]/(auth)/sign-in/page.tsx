import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "@/features/auth/sign-in-form";
import { isLocale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getT(isLocale(locale) ? locale : "ar");
  return { title: t("auth.signIn") };
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/[locale]/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return <SignInForm next={next} linkError={params.error === "link"} />;
}

export default function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  return (
    <Suspense fallback={<SignInForm />}>
      <SignIn searchParams={searchParams} />
    </Suspense>
  );
}
