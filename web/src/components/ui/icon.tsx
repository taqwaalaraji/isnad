import type { SVGProps } from "react";

import { ICON_EXTRAS } from "./icon-extras";
import { ICON_PATHS } from "./icon-paths";

const PATHS = { ...ICON_PATHS, ...ICON_EXTRAS };
export type IconName = keyof typeof PATHS;

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  size?: 16 | 20 | 24 | number;
  /** Accessible label. Without one the icon is decorative and hidden from assistive tech. */
  label?: string;
};

export function Icon({ name, size = 20, label, strokeWidth, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (size <= 16 ? 2 : 1.75)}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
