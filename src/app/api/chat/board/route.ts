//api/chat/board
import { ensureWorkspaceBoard } from "@/lib/chat/channels";
import { fromLib } from "@/lib/chat/response";

export async function POST() {
  const res = await ensureWorkspaceBoard();
  return fromLib(res, 200);
}
