import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CheckEmail } from "@/features/auth/check-email";

async function Content({ params, searchParams }: PageProps<"/[locale]/check-email">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const email = typeof query.email === "string" ? query.email : "";
  if (!email) redirect(`/${locale}/sign-in`);
  return <CheckEmail email={email} next={typeof query.next === "string" ? query.next : undefined} />;
}

export default function CheckEmailPage(props: PageProps<"/[locale]/check-email">) {
  return (
    <Suspense>
      <Content {...props} />
    </Suspense>
  );
}
