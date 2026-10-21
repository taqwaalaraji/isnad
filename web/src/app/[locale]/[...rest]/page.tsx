import { notFound } from "next/navigation";

/** Any URL that matches no page renders the localized not-found page. */
export default function CatchAll() {
  notFound();
}
