"use client";

import { useSyncExternalStore } from "react";

import { IconButton } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle() {
  const { t } = useI18n();
  // The layout script sets data-theme before paint; the server can't know it.
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("isnad-theme", next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }

  return (
    <IconButton
      icon={theme === "dark" ? "sun" : "moon"}
      label={theme === "dark" ? t("common.themeLight") : t("common.themeDark")}
      onClick={toggle}
    />
  );
}
