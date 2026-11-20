import Link from "next/link";

export type StaffRole = "admin" | "moderator";

const itemClass =
  "w-full cursor-pointer rounded-md px-2.5 py-2 text-left text-xs font-medium text-ink hover:bg-butter motion-safe:transition-colors sm:text-[13px]";

// Divider and heading that open the staff-only part of a dropdown menu.
export function StaffMenuLabel({ role }: { role: StaffRole }) {
  return (
    <>
      <div className="my-1 border-t-[1.5px] border-dashed border-edge" />
      <div className="px-2.5 pb-1 pt-0.5 text-[11px] font-semibold text-kmutt-orange">
        {role === "admin" ? "สำหรับผู้ดูแลระบบ" : "สำหรับผู้ช่วยดูแล"}
      </div>
    </>
  );
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
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className={`block ${itemClass}`}
    >
      {children}
    </Link>
  );
}
