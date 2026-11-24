"use client";

import { useRef, useSyncExternalStore } from "react";
import Mascot, { type MascotPose } from "@/component/ui/Mascot";

const POSES: MascotPose[] = ["wave", "peek", "grumpy", "sleepy", "cheer"];

const subscribe = () => () => {};

// A cat in a different pose each time the page is opened. The server can't
// know which one, so it sends an empty square of the same size and the browser
// fills in the pose, which keeps the layout still and avoids a hydration
// mismatch.
export default function RandomMascot({ className = "" }: { className?: string }) {
  const picked = useRef<MascotPose | null>(null);
  const pose = useSyncExternalStore(
    subscribe,
    () => (picked.current ??= POSES[Math.floor(Math.random() * POSES.length)]),
    () => null,
  );

  if (!pose) {
    return <div aria-hidden="true" className={`aspect-square ${className}`} />;
  }
  return <Mascot pose={pose} className={className} />;
}
