// The orange count on the bell: how many notifications are unread.
export default function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-kmutt-orange-dark px-1.5 text-xs leading-5 text-white max-sm:pointer-events-none max-sm:absolute max-sm:-right-2 max-sm:-top-2 max-sm:flex max-sm:h-5 max-sm:min-w-5 max-sm:items-center max-sm:justify-center max-sm:border-2 max-sm:border-paper max-sm:px-1 max-sm:font-bold max-sm:leading-none">
      {count > 99 ? "99" : count}
    </span>
  );
}
