// A recent post, shown on the room's card on Home.
export type RoomPreview = {
  author: string;
  content: string;
};

export type Room = {
  id: string;
  slug?: string;
  name: string;
  description: string;
  members: number;
  postsToday: number;
  totalPosts?: number;
  isPrivate: boolean;
  isNew: boolean;
  emoji?: string;
  // The latest posts, newest first. Only the most popular few rooms have it.
  preview?: RoomPreview[];
};

export type MyRoom = {
  id: string;
  slug?: string;
  name: string;
  unread: number;
  isPrivate: boolean;
  emoji?: string;
};
