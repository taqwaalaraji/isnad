"use client";

import { useEffect, useRef } from "react";

/**
 * Centres the marked figure (`[data-focus]`) inside the viewer's own scroll areas (the page itself
 * doesn't move), once it renders and whenever the focus changes.
 */
export function ScrollToFocus({ deps, children, className }: { deps: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    const target = root?.querySelector<HTMLElement>("[data-focus]");
    if (!root || !target) return;
    for (let el: HTMLElement | null = target.parentElement; el; el = el.parentElement) {
      const box = el.getBoundingClientRect();
      const spot = target.getBoundingClientRect();
      if (el.scrollHeight > el.clientHeight) el.scrollTop += spot.top - box.top - box.height / 2 + spot.height / 2;
      if (el.scrollWidth > el.clientWidth) el.scrollLeft += spot.left - box.left - box.width / 2 + spot.width / 2;
      if (el === root) break;
    }
  }, [deps]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
