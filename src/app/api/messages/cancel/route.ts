import { success, z } from "zod";
import { inngest } from "@/inngest/client";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex-client-";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";


const requestSchema = z.object({
    projectId: z.string(),
});


export async function POST(request : Request) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json(
            {error: "Unauthorized to access this content"},
            {status: 401}
        );
    };

    const body = await request.json();
    const { projectId } = requestSchema.parse(body)

    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
    if(!internalKey) {
        return NextResponse.json(
            {error: "Internal key invalid or not configured"},
            {status: 500}
        )
    };

    // Find all the processing messages in this projects:
    const processingMessages = await convex.query(
        api.system.getProcessingMessages, {
            projectId: projectId as Id<"projects">,
            internalKey,
        }
    );

    //If did not find any processing messages then cancel the api call
    if (processingMessages.length === 0) {
        return NextResponse.json({success: true, cancelled: false})
    };

    // Otherwise cancel all processing messages
    const cancelledIds = await Promise.all(
        processingMessages.map(async (msg) => {
            await inngest.send({
                name: "message/cancel",
                data: {
                    messageId: msg._id
                },
            });

            await convex.mutation(api.system.updateMessageStatus, {
                internalKey,
                messageId: msg._id,
                status: "cancelled"
            });

            return msg._id
        })
    );

    return NextResponse.json({
        success: true,
        cancelled: true,
        messageIds: cancelledIds
    });

};