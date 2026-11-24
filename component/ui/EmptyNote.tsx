import Icon, { type IconName } from "@/component/ui/Icon";
import Mascot, { type MascotPose } from "@/component/ui/Mascot";

// A blank dashed page in the notebook with an icon sticker, standing in for a
// list that has nothing in it yet. Pass `mascot` to put the cat there instead
// of the icon. Children go underneath, such as a button that clears a search.
export default function EmptyNote({
  icon,
  mascot,
  title,
  description,
  children,
}: {
  icon: IconName;
  mascot?: MascotPose;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-edge-strong bg-white/70 px-6 py-12 text-center">
      {/* The cat only appears on a wide screen; narrower ones keep the icon. */}
      {mascot && (
        <Mascot
          pose={mascot}
          className="-mt-8 mb-1 hidden w-full max-w-80 -rotate-3 lg:block"
        />
      )}
      <span
        aria-hidden="true"
        className={`mb-2 size-14 -rotate-6 items-center justify-center rounded-2xl border-[1.5px] border-ink bg-butter shadow-sticker ${
          mascot ? "flex lg:hidden" : "flex"
        }`}
      >
        <Icon name={icon} className="size-7" />
      </span>
      <p className="font-display text-xl font-semibold wrap-anywhere">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-ink-soft">{description}</p>
      )}
      {children}
    </div>
  );
}
