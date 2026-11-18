import { prisma } from "@/lib/prisma";
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
  return resolveRoomRoleFromRecords({
    roomCreatorId: room?.creatorId,
    userId,
    membership,
  });
}
