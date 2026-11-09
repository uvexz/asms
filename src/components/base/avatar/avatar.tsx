/* eslint-disable @next/next/no-img-element */
import type { HTMLAttributes, Ref } from "react";
import { Blobatar } from "@blobatar/react";
import type { Animate, TraitOverrides } from "blobatar";
import "blobatar/motion.css";
import { cx, sortCx } from "@/utils/cx";

/**
 * Figma source: Board UI → Avatar (styles Avatar/1…Avatar/26; used throughout
 * dashboard 1, node 3731:2932).
 *
 * Sizes used in the designs (px):
 *   xs = 20   breadcrumb workspace marks     (initials 10/15 semibold)
 *   sm = 24   table rows                     (initials 12/16 semibold)
 *   md = 32   sidebar workspace / team card  (initials 16/22 semibold)
 *   lg = 36   people cards                   (initials 18/24 semibold)
 *
 * Three states, in priority order:
 *   src    → the uploaded/remote photo.
 *   name   → a blobatar derived from that string. This is the default avatar:
 *            deterministic, so the same account always wears the same face,
 *            and it needs no upload, no network request and no storage.
 *   none   → initials on a tinted disc, kept for callers that have no seed.
 */

type AvatarSize = "xs" | "sm" | "md" | "lg";
type AvatarColor = "neutral" | "blue" | "lime" | "pink";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  size?: AvatarSize;
  color?: AvatarColor;
  /** Photo URL. Wins over everything else. */
  src?: string;
  alt?: string;
  /**
   * Seed for the fallback blobatar — a stable identity, not a label. Pass the
   * email (or handle) so a nickname change does not redraw the face.
   */
  name?: string;
  /**
   * Blobatar idle motion. `always` suits the one avatar on a profile or in the
   * sidebar; pass `hover` where many avatars share a screen (tables, grids).
   * Requires inline SVG, which `@blobatar/react` switches to whenever it is set.
   */
  animate?: Animate;
  /** Fallback initials when there is neither a photo nor a seed. */
  initials?: string;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * One house silhouette for everyone — `shape` is a 0–1 position over the
 * generation's silhouettes, and 0.11 lands inside the first band (round), so
 * every account is round and only hue, tone and features vary per name.
 */
const blobatarTraits: TraitOverrides = { shape: 0.11 };

const styles = sortCx({
  base: "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full text-center align-middle transition-[width,height,font-size] duration-200 ease",
  size: {
    xs: "size-5 text-[10px] leading-[15px] font-semibold",
    sm: "size-6 text-caption-1-semibold tracking-normal",
    md: "size-8 text-headline-semibold",
    lg: "size-9 text-[18px] leading-6 font-semibold",
  },
  color: {
    neutral: "bg-avatar-neutral-background text-text-secondary",
    blue: "bg-blue-300 text-blue-900",
    lime: "bg-lime-200 text-lime-700",
    pink: "bg-pink-200 text-pink-500",
  },
});

export function Avatar({
  size = "md",
  color = "neutral",
  src,
  alt,
  name,
  animate = "always",
  initials,
  className,
  ref,
  ...props
}: AvatarProps) {
  // The tinted disc exists to back initials. A photo covers it, and a blobatar
  // is a figure with its own contrast — a disc behind that reads as a halo ring
  // around the antialiased edge instead of as an avatar.
  const isInitials = !src && !name;

  return (
    <span
      ref={ref}
      className={cx(
        styles.base,
        styles.size[size],
        isInitials && styles.color[color],
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : name ? (
        // No plate: the figure sits directly on the surface, so it reads flat
        // like a photo does. Its own palette keeps head and eyes apart.
        <Blobatar
          name={name}
          background={false}
          traits={blobatarTraits}
          animate={animate}
          className="size-full"
        />
      ) : (
        initials
      )}
    </span>
  );
}
