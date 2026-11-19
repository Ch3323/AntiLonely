import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { handleToggleReactionHttp } from '@/lib/post-thread/reaction-helpers';
import { toggleMessageReaction } from '@/lib/post-thread/reaction-service';
import { signalRoomChange } from '@/lib/rooms/room-live-notify';

export async function POST(request: NextRequest) {
  const response = await handleToggleReactionHttp(request, {
    toggleReaction: async (input) => {
      const result = await toggleMessageReaction(input);
      if (result.ok) {
        // Only a reaction on the post itself shows on the room board.
        signalRoomChange({
          roomId: result.data.roomId,
          postId: result.data.postId,
          board: result.data.messageId === result.data.postId,
        });
      }
      return result;
    },
    revalidatePath,
  });

  return NextResponse.json(response.body, { status: response.status });
}
