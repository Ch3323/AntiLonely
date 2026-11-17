import { prisma } from "@/lib/prisma";

export type RoomRole = "owner" | "moderator";

// The role someone holds in a room, or null for ordinary members and people
// outside it. The creator counts as owner even if their membership row is
// gone (they left and came back, say), because the room is still theirs.
export async function getRoomRole(
  roomId: string,
  userId: string,
): Promise<RoomRole | null> {
  const [room, membership] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    }),
    prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
      select: { role: true, status: true },
    }),
  ]);
  if (room?.creatorId === userId) return "owner";
  if (membership?.status !== "active") return null;
  return membership.role === "owner" || membership.role === "moderator"
    ? membership.role
    : null;
}

// Owners and moderators can remove other people's posts and comments.
export function canModerateRoom(role: RoomRole | null): boolean {
  return role !== null;
}

// Only the owner changes the room itself, removes members or deletes it.
export function canManageRoom(role: RoomRole | null): boolean {
  return role === "owner";
}
