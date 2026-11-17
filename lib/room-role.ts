export type RoomRole = "owner" | "moderator";

export function resolveRoomRoleFromRecords(input: {
  roomCreatorId: string | null | undefined;
  userId: string | null | undefined;
  membership: { role?: string | null; status?: string | null } | null | undefined;
}): RoomRole | null {
  if (!input.userId) return null;
  if (input.roomCreatorId === input.userId) return "owner";
  if (input.membership?.status !== "active") return null;
  return input.membership.role === "owner" || input.membership.role === "moderator"
    ? input.membership.role
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
