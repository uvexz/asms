"use client";

import { useState, type ComponentType } from "react";
import {
  RiArrowDownCircleFill,
  RiArrowUpCircleFill,
  RiIndeterminateCircleFill,
  RiInformationFill,
} from "@remixicon/react";
import { Focusable } from "react-aria-components";
import { Chip } from "@/components/base/badges/chip";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";

/**
 * Figma source: Board UI → dashboard 1 → Frame 20 (node 3731:3160) for the
 * plain cards; the footer variant follows the same inner-tile recipe as the
 * recent hires card.
 *
 * KPI stat cards in two looks:
 *
 *   plain   icon tile, label, value, delta chip — the compact dashboard row
 *   footer  tinted gradient icon tile beside the label (plus an optional
 *           info tooltip), a display-size value, and a white footer band
 *           carrying the comparison caption and a delta pill
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type StatCardsVariant = "plain" | "footer";

/** Tint of the footer variant's gradient icon tile. */
type StatTone = "blue" | "orange" | "purple" | "pink" | "sky" | "emerald";

export type Stat = {
  icon: IconComponent;
  label: string;
  value: string;
  delta: string;
  deltaColor: "lime" | "rose" | "neutral";
  /** Footer variant: icon tile tint (defaults to blue). */
  tone?: StatTone;
  /** Footer variant: comparison caption in the band ("From last month"). */
  caption?: string;
  /** Footer variant: shows an info glyph with this text on hover. */
  hint?: string;
};

/** Semantic status tints for the footer variant's icon tile. */
const TILE_TONES: Record<StatTone, string> = {
  blue: "bg-status-blue-background text-status-blue-text",
  orange: "bg-status-orange-background text-status-orange-text",
  purple: "bg-status-purple-background text-status-purple-text",
  pink: "bg-status-rose-background text-status-rose-text",
  sky: "bg-status-cyan-background text-status-cyan-text",
  emerald: "bg-status-lime-background text-status-lime-text",
};

const DELTA_STYLES: Record<
  Stat["deltaColor"],
  { icon: IconComponent; className: string; pill: string }
> = {
  lime: {
    icon: RiArrowUpCircleFill,
    className: "text-status-lime-text",
    pill: "bg-status-lime-background",
  },
  rose: {
    icon: RiArrowDownCircleFill,
    className: "text-status-rose-text",
    pill: "bg-status-rose-background",
  },
  neutral: {
    icon: RiIndeterminateCircleFill,
    className: "text-text-secondary",
    pill: "bg-background-secondary-default",
  },
};

/** Tinted pill with a direction glyph — the footer band's delta readout, in
 *  the same lime and rose the chart cards use for their trend chips. */
function DeltaPill({ delta, deltaColor }: Pick<Stat, "delta" | "deltaColor">) {
  const { icon: Icon, className, pill } = DELTA_STYLES[deltaColor];
  return (
    <span
      className={cx(
        "flex shrink-0 items-center gap-1 rounded-full py-0.5 pe-2 ps-1",
        pill,
      )}
    >
      <Icon className={cx("size-4 shrink-0", className)} aria-hidden />
      <span className={cx("text-body-medium whitespace-nowrap tabular-nums", className)}>
        {delta}
      </span>
    </span>
  );
}

/** Bare info glyph with a tooltip — the footer header's trailing control.
 *  Opens on hover and focus as tooltips do, and on click as well, since a
 *  glyph this small reads as a button and gets tapped. */
function StatHint({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipTrigger delay={200} isOpen={open} onOpenChange={setOpen}>
      <Focusable>
        <button
          type="button"
          aria-label={`关于 ${label}`}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground-icon-secondary outline-none transition-colors duration-150 ease hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiInformationFill className="size-5" aria-hidden />
        </button>
      </Focusable>
      <Tooltip size="md">{hint}</Tooltip>
    </TooltipTrigger>
  );
}

function PlainStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex h-[132px] min-w-0 flex-col items-start justify-between rounded-2xl bg-background-secondary-default p-4">
      <span className="flex items-center rounded-md bg-stat-card-icon-background p-1.5">
        <stat.icon className="size-5 shrink-0 text-foreground-icon-primary" aria-hidden />
      </span>
      <div className="flex w-full flex-col gap-0.5">
        <p className="w-full text-body-medium text-text-secondary">{stat.label}</p>
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="text-title-1-medium whitespace-nowrap text-text-primary">{stat.value}</p>
          <Chip variant="bold" color={stat.deltaColor}>
            {stat.delta}
          </Chip>
        </div>
      </div>
    </section>
  );
}

function FooterStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl bg-background-secondary-default p-2">
      {/* Icon tile + optional info glyph, both hanging from the same top inset */}
      <div className="flex w-full items-start justify-between gap-2.5 p-2">
        <span
          className={cx(
            "flex size-10 shrink-0 items-center justify-center rounded-2lg",
            TILE_TONES[stat.tone ?? "blue"],
          )}
        >
          <stat.icon className="size-5 shrink-0" aria-hidden />
        </span>
        {stat.hint && <StatHint label={stat.label} hint={stat.hint} />}
      </div>

      {/* Label sits directly over the number, as on the plain cards */}
      <div className="flex flex-1 flex-col gap-0.5 px-2 pt-2.5 pb-3.5">
        <p className="truncate text-body-medium text-text-secondary">{stat.label}</p>
        <p className="text-display-4-medium whitespace-nowrap text-text-primary tabular-nums">
          {stat.value}
        </p>
        {/* Without a comparison there is no trend to draw: state the fact
            (quota, limit) instead of inventing a delta row. */}
        {!stat.delta && stat.caption ? (
          <p className="mt-1 truncate text-caption-1-regular text-text-tertiary">
            {stat.caption}
          </p>
        ) : null}
      </div>

      {/* Footer band: comparison caption + delta pill on an inner tile */}
      {stat.delta ? (
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2lg bg-background-inner-default py-1.5 pe-1.5 ps-2.5 shadow-card">
          <p className="truncate text-body-regular text-text-secondary">
            {stat.caption ?? "较上月"}
          </p>
          <DeltaPill delta={stat.delta} deltaColor={stat.deltaColor} />
        </div>
      ) : null}
    </section>
  );
}

export function StatCards({
  variant = "plain",
  stats,
  columns = 4,
  className,
}: {
  variant?: StatCardsVariant;
  /** KPI cards to render. */
  stats: Stat[];
  /** Columns at the widest breakpoint - 2 keeps the grid two-up for
   *  narrower hosts (docs previews, split layouts), 1 pins a single
   *  column at every width. */
  columns?: 1 | 2 | 4;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid w-full gap-4",
        // The footer cards carry a display-size value, so they go one per
        // row on phones where the plain cards still fit two up.
        columns === 1
          ? "grid-cols-1"
          : variant === "footer"
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-2",
        columns === 4 && (variant === "footer" ? "xl:grid-cols-4" : "lg:grid-cols-4"),
        className,
      )}
    >
      {stats.map((stat) =>
        variant === "footer" ? (
          <FooterStatCard key={stat.label} stat={stat} />
        ) : (
          <PlainStatCard key={stat.label} stat={stat} />
        ),
      )}
    </div>
  );
}
