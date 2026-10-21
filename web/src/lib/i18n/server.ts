import "server-only";

import { cache } from "react";

import { type Locale } from "./config";
import { createTranslator } from "./translate";

const loaders = {
  ar: () => import("./dictionaries/ar").then((m) => m.default),
  en: () => import("./dictionaries/en").then((m) => m.default),
};

export const getDictionary = cache(async (locale: Locale) => loaders[locale]());

export async function getT(locale: Locale) {
  return createTranslator(await getDictionary(locale));
}
