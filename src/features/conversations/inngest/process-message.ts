import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client-";
import { api } from "../../../../convex/_generated/api";
import { CODING_AGENT_SYSTEM_PROMPT, TITLE_GENERATOR_SYSTEM_PROMPT } from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { createAgent, createNetwork, openai } from "@inngest/agent-kit";

//tools for agent to use during task execution
import { createReadFilesTool } from "./tools/read-files";
import { createListFilesTool } from "./tools/list-files";
import { createUpdateFileTool } from "./tools/update-file";
import { createCreateFilesTool } from "./tools/create-files";
import { createCreateFolderTool } from "./tools/create-folder";
import { createRenameFileTool } from "./tools/rename-file";
import { createDeleteFilesTool } from "./tools/delete-files";
import { createScrapeUrlsTool } from "./tools/scrape-urls";




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
  async ({ event, step }) => {
    const { messageId, conversationId, projectId, message } =
      event.data as MessageEvent;

    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      throw new NonRetriableError(
        "CODEGEN_CONVEX_INTERNAL_KEY is not configured",
      );
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
        limit: 10, //No of msgs to return
      });
    });

    let systemPrompt = CODING_AGENT_SYSTEM_PROMPT;
    // filter out the current message from recent messages and also empty messages if any
    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== "",
    );

    if (contextMessages.length > 0) {
      const historyText = contextMessages
        .map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
        .join("\n\n---\n\n");

      systemPrompt += `\n\n<conversation_history>\n${historyText}\n</conversation_history>\n\n<current_turn_instruction>\nThe above is previous conversation history for context only. Respond ONLY to the user's new message. Do not repeat or rehash previous responses.\n</current_turn_instruction>`;
    }

    // Generate conversation title if the name is default conversation (which is NEW CONVERSATION)
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;
    if (shouldGenerateTitle) {
      const titleAgent = createAgent({
        name: "Title Generator",
        system: TITLE_GENERATOR_SYSTEM_PROMPT,
        model: openai({
          model: "gpt-4o-mini",
          defaultParameters: {
            max_completion_tokens: 50,
          },
        }),
      });

      const { output } = await titleAgent.run(message, { step });

      const textMessage = output.find(
        (m) => m.role === "assistant" && m.type === "text",
      );

      if (textMessage?.type === "text") {
        const title =
          typeof textMessage.content === "string"
            ? textMessage.content.trim()
            : textMessage.content
                .map((c) => c.text)
                .join("")
                .trim();

        if (title) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title,
            });
          });
        }
      }
    }

    // The Coding agent with flies tools:
    const codingAgent = createAgent({
      name: "CodeGen",
      description: "An expert AI Coding assistant",
      system: systemPrompt,
      model: openai({
        model: "gpt-5",
        defaultParameters: {
          max_completion_tokens: 15000,
        },
      }),
      tools: [
        createListFilesTool({ internalKey, projectId }),
        createReadFilesTool({ internalKey }),
        createUpdateFileTool({ internalKey }),
        createCreateFilesTool({ internalKey, projectId }),
        createCreateFolderTool({ projectId, internalKey }),
        createRenameFileTool({ internalKey }),
        createDeleteFilesTool({ internalKey }),
        createScrapeUrlsTool(),
      ],
    });

    // Create network with single agent
    const network = createNetwork({
      name: "codegen-network",
      agents: [codingAgent],
      maxIter: 15,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        if (!lastResult) return codingAgent;

        const hasToolCalls = lastResult.output.some(
          (m) => m.type === "tool_call",
        );

        // If the agent made tool calls, continue so it can process results
        if (hasToolCalls) {
          return codingAgent;
        }

        // Agent produced a text response with no tool calls — done
        return undefined;
      },
    });

    // Run the Agent:
    const result = await network.run(message);

    // Extract all text messages from the agent across all iterations
    const allTextMessages = result.state.results
      .flatMap((r) => r.output)
      .filter((m) => m.type === "text" && m.role === "assistant");

    // Get the last text message (the final response)
    const textMessage = allTextMessages.at(-1);

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    if (textMessage?.type === "text") {
      const content =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");

      // Only use the extracted content if it's not empty
      if (content.trim()) {
        assistantResponse = content;
      }
    }

    //Update the assistant message with the response => also set status to "completed"
    await step.run("update-assistant-message", async () => {
      return await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      });
    });

    return { success: true, messageId, conversationId };
  },
);