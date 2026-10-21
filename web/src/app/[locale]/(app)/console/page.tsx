import { redirect } from "next/navigation";

import { isLocale } from "@/lib/i18n/config";

export default async function ConsoleIndex({ params }: PageProps<"/[locale]/console">) {
  const { locale } = await params;
  redirect(`/${isLocale(locale) ? locale : "ar"}/console/sources`);
}
