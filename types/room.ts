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
  // The latest posts, newest first. Left out for private rooms the viewer
  // hasn't joined.
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
