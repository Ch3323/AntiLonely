import { prisma } from "@/lib/shared/prisma";
import {
  canManageRoom,
  canModerateRoom,
  resolveRoomRoleFromRecords,
  type RoomRole,
} from "./room-role";

export {
  canManageRoom,
  canModerateRoom,
  resolveRoomRoleFromRecords,
  type RoomRole,
};

// The role someone holds in a room, or null for ordinary members and people
// outside it. The creator counts as owner even if their membership row is
// gone (they left and came back, say), because the room is still theirs.
export async function getRoomRole(
  roomId: string,
  userId: string,
): Promise<RoomRole | null> {
  const [room, membership, user] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    }),
    prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
      select: { role: true, status: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
  ]);
  const role = resolveRoomRoleFromRecords({
    roomCreatorId: room?.creatorId,
    userId,
    membership,
  });
  // Site admins and moderators can moderate any room (delete posts and
  // comments), but only an owner manages the room itself.
  if (role === null && (user?.role === "admin" || user?.role === "moderator")) {
    return "moderator";
  }
  return role;
}
