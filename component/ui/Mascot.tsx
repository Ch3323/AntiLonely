// The AntiLonely cat. One transparent PNG per pose in public/mascot, all
// decoration, so they are hidden from screen readers.

export type MascotPose = "wave" | "peek" | "grumpy" | "sleepy" | "cheer";

const POSE_FILE: Record<MascotPose, string> = {
  wave: "/mascot/wave.png",
  peek: "/mascot/peek.png",
  grumpy: "/mascot/grumpy.png",
  sleepy: "/mascot/sleepy.png",
  cheer: "/mascot/cheer.png",
};

export default function Mascot({
  pose,
  className = "",
}: {
  pose: MascotPose;
  className?: string;
}) {
  return (
    <img
      src={POSE_FILE[pose]}
      alt=""
      aria-hidden="true"
      width={321}
      height={321}
      draggable={false}
      className={`select-none motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:scale-105 motion-safe:active:translate-y-0 motion-safe:active:scale-90 ${className}`}
    />
  );
}
