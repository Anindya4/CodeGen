import { success, z } from "zod";
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


export async function POST(request: Request) {
    const { userId } = await auth();

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

    // TODO: Ingest background jobs to process the assistant messages
    const event = await inngest.send({
        name: "message/sent",
        data: {
            messageId : assistantMessageId,
        }
    })


    return NextResponse.json({
        success: true, 
        eventId: event.ids[0],
        messageId: assistantMessageId
    }
    )

}