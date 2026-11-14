"use client";

import { useCallback, useRef } from "react";
import type { CSSProperties, RefObject, UIEvent } from "react";
import { cx } from "@/utils/cx";

/**
 * The soft top edge of an internal scroll region: a 24px masked 1px backdrop
 * blur, a 16px masked 4px blur closer to the edge, and a wash of the
 * enclosing surface colour. Each layer fades in over the first 24px
 * scrolled, so the resting state keeps a plain top edge.
 *
 *   const fade = useScrollFade();
 *   <div className="relative min-h-0 flex-1">
 *     <div onScroll={fade.onScroll} className="h-full overflow-y-auto">…</div>
 *     <ScrollFade overlayRef={fade.overlayRef} surfaceClassName="from-background-primary-default" />
 *   </div>
 *
 * Keep the header outside the scroll region, and the overlay outside the
 * scroller (it must stay put while the content moves under it). Opacity goes
 * on each layer, never on the wrapper: a translucent parent becomes the
 * backdrop root, and the blur layers would sample nothing.
 *
 * Progress is written to a CSS variable on the overlay rather than to React
 * state. A scroll handler that calls `setState` re-renders the whole list on
 * every frame — during the exact gesture the user is judging — and React never
 * needs to know how far the region has scrolled.
 */

/** Scroll distance, in px, over which the fade ramps from 0 to 1. */
const SCROLL_FADE_DISTANCE = 24;

export function useScrollFade(distance = SCROLL_FADE_DISTANCE) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      const progress = Math.min(
        1,
        Math.max(0, event.currentTarget.scrollTop) / distance,
      );
      overlayRef.current?.style.setProperty("--scroll-fade", String(progress));
    },
    [distance],
  );

  const reset = useCallback(() => {
    overlayRef.current?.style.setProperty("--scroll-fade", "0");
  }, []);

  return { overlayRef, onScroll, reset };
}

export interface ScrollFadeProps {
  /** The ref handed out by `useScrollFade`; it carries the progress variable. */
  overlayRef: RefObject<HTMLDivElement | null>;
  /**
   * The `from-*` class of the surface the region sits on, written out in
   * full so Tailwind can see it. Defaults to the primary surface.
   */
  surfaceClassName?: string;
  className?: string;
}

export function ScrollFade({
  overlayRef,
  surfaceClassName = "from-background-primary-default",
  className,
}: ScrollFadeProps) {
  const layer: CSSProperties = { opacity: "var(--scroll-fade, 0)" };

  return (
    <div
      ref={overlayRef}
      aria-hidden
      style={{ "--scroll-fade": "0" } as CSSProperties}
      className={cx("pointer-events-none absolute inset-x-0 top-0 z-10 h-6", className)}
    >
      <div
        className="absolute inset-0 backdrop-blur-[1px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        style={layer}
      />
      <div
        className="absolute inset-x-0 top-0 h-4 backdrop-blur-[4px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        style={layer}
      />
      <div className={cx("absolute inset-0 bg-linear-to-b to-transparent", surfaceClassName)} style={layer} />
    </div>
  );
}
