import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client-";
import { api } from "../../../../convex/_generated/api";
import { CODING_AGENT_SYSTEM_PROMPT, TITLE_GENERATOR_SYSTEM_PROMPT } from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { createAgent, createNetwork, openai } from "@inngest/agent-kit";
import { createReadFileTool } from "./tools/read-file";
import { createListFileTool } from "./tools/list-files";
import { createUpdateFileTool } from "./tools/update-file";




interface MessageEvent {
    messageId: Id<"messages">;
    conversationId: Id<'conversations'>;
    projectId: Id<"projects">;
    message: string;
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
        conversationId,
        projectId,
        message,
    } = event.data as MessageEvent;

    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
        throw new NonRetriableError("CODEGEN_CONVEX_INTERNAL_KEY is not configured");
    }
    //TODO: Check if this is needed
    await step.sleep("wait-for-db-sync", "1s");

    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationId, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) throw new NonRetriableError("Conversation not found");

    // Get recent messages for conversation context
    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10 //No of msgs to return 
      });
    });

    
    let systemPrompt = CODING_AGENT_SYSTEM_PROMPT;

    // filter out the current message from recent messages and also empty messages if any
    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== ""
    );


    if (contextMessages.length > 0) {
      const historyText = contextMessages.map((msg) => 
        `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n");
      
      systemPrompt += `\n\n## Conversation History:\n${historyText}\n\n## Current Request:\nRespond only to the user's latest message above. Use the conversation history for context but do not repeat previous responses verbatim.`;
    };


    // Generate conversation title if the name is default conversation (which is NEW CONVERSATION)
    const shouldGenerateTitle = conversation.title === DEFAULT_CONVERSATION_TITLE;
    if (shouldGenerateTitle) {
      const titleAgent = createAgent({
        name: "Title Generator",
        system: TITLE_GENERATOR_SYSTEM_PROMPT,
        model: openai({
           model: "gpt-4o-mini", 
           defaultParameters: {
            max_completion_tokens: 50
          }
        }),
      });

      const { output } = await titleAgent.run(message, { step })

      const textMessage = output.find(
        (m) => m.role === "assistant" && m.type === "text"
      );

      if (textMessage?.type === "text") {
        const title = typeof textMessage.content === "string" ? 
          textMessage.content.trim() : textMessage.content
            .map((c)=>c.text).join("").trim();

        if (title) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title
            });
          });
        };
      };
    };



    // The Coding agent with flies tools:
    const codingAgent = createAgent({
      name: "CodeGen",
      description: "An expert AI Coding assistant",
      system: systemPrompt,
      model: openai({
        model: "gpt-3.5-turbo",
        defaultParameters: {
          max_completion_tokens: 3000,
          temperature: 0.3,
        }
      }),
      tools: [
        createListFileTool({internalKey, projectId}),
        createReadFileTool({internalKey}),
        createUpdateFileTool({ internalKey }),
      ],
    });

    // Create network with single agent
    const network = createNetwork({
      name: "codegen-network",
      agents: [codingAgent],
      maxIter: 10,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant"
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call"
        );

        if (hasTextResponse && !hasToolCalls) return undefined;

        return codingAgent;
      }
    });

    // Run the Agent:
    const result = await network.run(message)

    // extract the last message of assistant
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant"
    );

    let assistantResponse = "I processed your request. Let me know if you needed anything else!";

    if (textMessage?.type === "text") {
      assistantResponse = typeof textMessage.content === "string" ? textMessage.content : textMessage.content.map((c) => c.text).join("");
    }


    //Update the assistant message with the response => also set status to "completed"
    await step.run("update-assistant-message", async () => {
        await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content: assistantResponse,
        })
    });

    return { success: true, messageId, conversationId };
  },
);