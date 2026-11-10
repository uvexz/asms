"use client";

import { useEffect, useState } from "react";
import {
  RiLogoutBoxRLine,
  RiSettings4Line,
  RiShieldUserLine,
} from "@remixicon/react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { ChevronUpDownSmall } from "@/components/foundations/icons/chevrons";
import { useDirection } from "@/components/foundations/direction/direction";
import { cx } from "@/utils/cx";

function Collapsible({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out",
        collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-40 opacity-100 blur-0",
      )}
    >
      {children}
    </span>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <AriaButton
      type="button"
      onPress={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-2lg p-2 text-start outline-none transition-colors hover:bg-background-primary-hover focus-visible:bg-background-primary-hover"
    >
      <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <span className="truncate text-body-medium text-text-primary">{label}</span>
    </AriaButton>
  );
}

export type SidebarUser = {
  name: string;
  email: string;
  image?: string | null;
};

export function DashboardUserMenu({
  collapsed = false,
  suppressHover = false,
  onHoverSuppressionEnd,
  avatarClassName,
  user,
  isAdmin = false,
  onSettings,
  onSignOut,
  onAdmin,
}: {
  collapsed?: boolean;
  suppressHover?: boolean;
  onHoverSuppressionEnd?: () => void;
  avatarClassName?: string;
  user: SidebarUser;
  isAdmin?: boolean;
  onSettings?: () => void;
  onSignOut?: () => void;
  onAdmin?: () => void;
}) {
  const direction = useDirection();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const initials = user.name.trim().slice(0, 1).toUpperCase() || "A";

  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <AriaButton
        aria-label={user.name}
        onPointerLeave={() => {
          if (suppressHover) onHoverSuppressionEnd?.();
        }}
        className={cx(
          "relative flex min-w-0 cursor-pointer items-center gap-2 rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2",
          "before:pointer-events-none before:absolute before:-inset-x-1.5 before:-inset-y-[5px] before:rounded-full before:border-2 before:border-transparent before:transition-colors before:duration-150",
          !suppressHover && "hover:before:border-border-sidebar-profile-hover",
          collapsed && "w-9 justify-center gap-0 before:-inset-x-[3px]",
        )}
      >
        <Avatar
          size="md"
          color="neutral"
          name={user.email || user.name}
          initials={initials}
          src={user.image ?? undefined}
          className={avatarClassName}
        />
        <Collapsible collapsed={collapsed}>
          <span className="flex items-center gap-0.5">
            <span className="max-w-36 truncate text-body-medium whitespace-nowrap text-text-primary">
              {user.name}
            </span>
            <ChevronUpDownSmall className="size-4 shrink-0 text-foreground-icon-tertiary" />
          </span>
        </Collapsible>
      </AriaButton>

      <AriaPopover
        placement={isMobile ? "bottom start" : direction === "rtl" ? "left top" : "right top"}
        offset={8}
        className={cx(
          "w-[265px] max-w-[calc(100vw-32px)] origin-top-left overflow-y-auto",
          "rounded-2xl border border-border-button-default bg-background-primary-default p-2.5 shadow-dropdown",
          "transition duration-150 ease-out",
          "data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px]",
          "data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
        )}
      >
        <AriaDialog aria-label="账号菜单" className="flex flex-col outline-none">
          <div className="flex items-center gap-2.5 px-2 pb-2 pt-1">
            <Avatar
              size="md"
              color="neutral"
              name={user.email || user.name}
              initials={initials}
              src={user.image ?? undefined}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-body-medium text-text-primary">{user.name}</span>
              <span className="truncate text-caption-1-regular text-text-tertiary">{user.email}</span>
            </div>
          </div>
          <div className="-mx-2.5 my-2 h-px bg-border-button-default" />
          <div className="flex flex-col gap-1">
            {onSettings ? (
              <MenuRow
                icon={RiSettings4Line}
                label="个人设置"
                onClick={() => {
                  setIsOpen(false);
                  onSettings();
                }}
              />
            ) : null}
            {isAdmin && onAdmin ? (
              <MenuRow
                icon={RiShieldUserLine}
                label="管理后台"
                onClick={() => {
                  setIsOpen(false);
                  onAdmin();
                }}
              />
            ) : null}
            {onSignOut ? (
              <MenuRow
                icon={RiLogoutBoxRLine}
                label="退出登录"
                onClick={() => {
                  setIsOpen(false);
                  onSignOut();
                }}
              />
            ) : null}
          </div>
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
