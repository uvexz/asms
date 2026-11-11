import type { SVGProps } from "react";

/**
 * Custom chevron glyphs drawn as vectors in the Board UI Figma file (they are
 * not Remix icons). Paths are copied 1:1 from the Figma export.
 *
 * All icons render `currentColor` and size via Tailwind `size-*` utilities,
 * exactly like the Remix icon components.
 */

type IconProps = SVGProps<SVGSVGElement>;

/** 16×16 rounded 2px-stroke chevron. Select triggers, disclosure affordances. */
export function ChevronDownSmall(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M4 7L7.29289 10.2929C7.68342 10.6834 8.31658 10.6834 8.70711 10.2929L12 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 16×16 stacked up/down chevrons. Workspace / account switchers. */
export function ChevronUpDownSmall(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <g transform="translate(4.25 2.56)">
        <path
          d="M0.75 7.43934L3.21967 9.90901C3.51256 10.2019 3.98744 10.2019 4.28033 9.90901L6.75 7.43934"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M0.75 3.43934L3.21967 0.96967C3.51256 0.676777 3.98744 0.676777 4.28033 0.96967L6.75 3.43934"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
