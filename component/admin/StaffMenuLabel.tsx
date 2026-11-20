import Link from "next/link";
import Icon from "@/component/ui/Icon";

export type StaffRole = "admin" | "moderator";

const itemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-ink hover:bg-butter motion-safe:transition-colors sm:text-[13px]";

// Shield that marks a menu entry as staff-only, placed before its label.
export function StaffIcon() {
  return <Icon name="shield" className="size-3.5 text-kmutt-orange" />;
}

// Divider that opens the staff-only part of a dropdown menu.
export function StaffMenuLabel() {
  return <div className="my-1 border-t-[1.5px] border-dashed border-edge" />;
}

// A menu entry that jumps to a page of the admin panel.
export function StaffMenuLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={itemClass}>
      <StaffIcon />
      {children}
    </Link>
  );
}
