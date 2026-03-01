import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client-";
import { api } from "../../../../convex/_generated/api";

interface MessageEvent {
    messageId: Id<"messages">;
};



export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
        {
        event: "message/cancel",
        if: "async.data.messageId == event.data.messageId",
        },
    ],
    onFailure: async ({event, step}) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;

      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content: "My apologies, I encountered an error while processing your request at this moment. Please ask me anything else!"
          })
        })
      }
    }
  },
  {
    event: "message/sent"
  },
  async ({ event , step}) => {
    const {
        messageId,
    } = event.data as MessageEvent;

    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
        throw new NonRetriableError("CODEGEN_CONVEX_INTERNAL_KEY is not configured");
    }

    await step.sleep("wait-for-ai-processing", "3s");

    await step.run("update-assistant-message", async () => {
        await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content: "AI processed this message (TODO)"
        })
    });

  }
);