// app/api/conversations/route.ts
// Lists all past conversation sessions (for sidebar)

import { NextResponse } from "next/server";
import { listConversations } from "@/lib/memory/store";

export async function GET() {
  const conversations = listConversations();
  return NextResponse.json({ conversations });
}
