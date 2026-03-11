import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client-";
import { api } from "../../../../../convex/_generated/api";
import { DEFAULT_CONVERSATION_TITLE } from "@/features/conversations/constants";

const requestSchema = z.object({
  prompt: z.string().min(1),
});

const FREE_CALL_LIMIT = 5;

export async function POST(request: Request) {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  };

  const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal Key is not configured" },
      { status: 500 },
    );
  };

  const hasPro = has({ plan: "pro" });

  if (!hasPro) {
    const { callCount } = await convex.query(api.system.getUserWeeklyUsage, {
      userId,
      internalKey,
    });

    if (callCount >= FREE_CALL_LIMIT) {
      return NextResponse.json(
        { error: "limit_reached", remaining: 0 },
        { status: 429 }
      );
    }
  }

  const body = await request.json();
  const { prompt } = requestSchema.parse(body)

  //Generate a random project name
  const projectName = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, colors],
    separator: "-",
    length: 3,
  });

  //create project and conversation together
  const { projectId, conversationId } = await convex.mutation(
    api.system.createProjectWithConversation, {
      internalKey,
      projectName,
      conversationTitle: DEFAULT_CONVERSATION_TITLE,
      ownerId: userId
    }
  );

  //create user message
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId,
    projectId,
    role: 'user',
    content: prompt
  });

  //create assistant message placeholder with processing status
  const assistantMessageId = await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId,
    projectId,
    role: "assistant",
    content: "",
    status: "processing"
  });

  //trigger inngest to process the message
  await inngest.send({
    name: "message/sent",
    data : {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      message: prompt
    }
  });

  let remaining: number | null = null;
  if (!hasPro) {
    const newCount = await convex.mutation(api.system.incrementUserUsage, {
      userId,
      internalKey,
    });
    remaining = Math.max(0, FREE_CALL_LIMIT - newCount);
  }

  return NextResponse.json({ projectId, remaining })
}
