import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import { convex } from "@/lib/convex-client-";
import { Id } from "../../../../convex/_generated/dataModel";
import { inngest } from "@/inngest/client";




const requestSchema = z.object({
    conversationId: z.string(),
    message: z.string()
});


const FREE_CALL_LIMIT = 5;

export async function POST(request: Request) {
    const { userId, has } = await auth();

    if (!userId) {
        return NextResponse.json({error: "Unauthorized"}, {status: 401})
    }
    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
    if (!internalKey) {
        return NextResponse.json(
            {error: "Internal Key not configured"},
            {status: 500}
        )
    }

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
    const { conversationId, message } = requestSchema.parse(body);
    

    //call convex mutation, query
    const conversation = await convex.query(api.system.getConversationId, {
        internalKey,
        conversationId: conversationId as Id<"conversations">
    });


    if (!conversation) {
        return NextResponse.json(
            {error: "Conversation not found"},
            {status: 404}
        )
    }

    const projectId = conversation.projectId;


    // Find all the processing messages in this projects:
    const processingMessages = await convex.query(
        api.system.getProcessingMessages, {
            projectId: projectId,
            internalKey,
        }
    );

    if (processingMessages.length > 0) {
      // cancel all the processing messages
      await Promise.all(
        processingMessages.map(async (msg) => {
          await inngest.send({
            name: "message/cancel",
            data: {
              messageId: msg._id,
            },
          });

          await convex.mutation(api.system.updateMessageStatus, {
            internalKey,
            messageId: msg._id,
            status: "cancelled",
          });
        }),
      );
    }


    await convex.mutation(api.system.createMessage, {
        internalKey,
        conversationId: conversationId as Id<"conversations">,
        projectId,
        role: "user",
        content: message
    });

    //create assistant message placeholder with processing status
    const assistantMessageId = await convex.mutation(api.system.createMessage, {
        internalKey,
        conversationId: conversationId as Id<"conversations">,
        projectId,
        role: "assistant",
        content: "",
        status: "processing",
    });

    
    const event = await inngest.send({
        name: "message/sent",
        data: {
            messageId : assistantMessageId,
            conversationId,
            projectId,
            message,
        }
    })

    let remaining: number | null = null;
    if (!hasPro) {
        const newCount = await convex.mutation(api.system.incrementUserUsage, {
            userId,
            internalKey,
        });
        remaining = Math.max(0, FREE_CALL_LIMIT - newCount);
    }

    return NextResponse.json({
        success: true,
        eventId: event.ids[0],
        messageId: assistantMessageId,
        remaining,
    })

}