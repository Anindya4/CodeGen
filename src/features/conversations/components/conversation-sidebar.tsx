import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import { useState } from "react";
import {
    CopyIcon,
    HistoryIcon,
    LoaderIcon,
    PlusIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    Conversation,
    ConversationContent,
    ConversationScrollButton
} from "@/components/ai-elements/conversation"
import {
    Message,
    MessageContent,
    MessageResponse,
    MessageAction,
    MessageActions
} from "@/components/ai-elements/message"
import {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputTools,
    type PromptInputMessage
} from "@/components/ai-elements/prompt-input"

import {    
    useConversation,
    useConversations,
    useCreateConversation,
    useMessages
} from "../hooks/use-conversations"

import { Id } from "../../../../convex/_generated/dataModel";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { PastConversationDialog } from "./convo-history-dialog";
import { useClerk } from "@clerk/nextjs";






interface ConversationSidebarProps {
    projectId: Id<"projects">;
};

export const ConversationSidebar = ({
    projectId,
}: ConversationSidebarProps) => {
    const { openUserProfile } = useClerk();
    const [input, setInput] = useState("");

    const [selectedConversationId, setSelectConversationId] = useState<Id<"conversations"> | null>(null);
    
    const conversations = useConversations(projectId)

    const activeConversationId = selectedConversationId ?? conversations?.[0]?._id ?? null;

    const activeConversation = useConversation(activeConversationId)
    
    const conversationMessage = useMessages(activeConversationId)
    
    const [pastConversationsOpen, setPastConversationsOpen] = useState(false)

    const isProcessing = conversationMessage?.some(
        (msg) => msg.status === "processing"
    )

    const createConversation = useCreateConversation();

    const handleCreateConversation = async () => {
        try{
            const newConversationId = await createConversation({
                projectId,
                title: DEFAULT_CONVERSATION_TITLE,
            });

            setSelectConversationId(newConversationId);
            return newConversationId;
        } catch {
            toast.error("Unable to create new conversation");
            return null;
        }
    };


    const handleCancel = async () => {
        try {
            await ky.post("/api/messages/cancel", {
                json: { projectId }
            })
        } catch {
            toast.error("Unable to cancel request!")
        }
    };


    const handleSubmit = async (message: PromptInputMessage) => {
        // If processing and no new message, this is just a stop function
        if (isProcessing && !message.text) {
            await handleCancel()
            setInput("")
            return;
        }

        let conversationId = activeConversationId;
        
        if (!conversationId){
            conversationId = await handleCreateConversation();
            if (!conversationId) return;
        }
        
        // Trigger ingest functions via API
        try {
            const res = await ky.post("/api/messages", {
                json: {
                    conversationId,
                    message: message.text
                },
            }).json<{ remaining: number | null }>();

            if (res.remaining !== null) {
                if (res.remaining === 0) {
                    toast.warning("You've used all 5/5 free calls this week. Upgrade to Pro for unlimited access.");
                } else {
                    toast.info(`You have ${res.remaining}/5 free calls remaining this week.`);
                }
            }
        } catch (error) {
            if (error instanceof HTTPError && error.response.status === 429) {
                toast.error("Weekly limit reached. Upgrade to Pro for unlimited access.", {
                  action : {
                    label: "Upgrade",
                    onClick : () => openUserProfile()
                  }
                });
            } else {
                toast.error("Failed to send message");
            }
        }

        setInput("")

    }
    
    return (
      <>
      <PastConversationDialog
      projectId={projectId}
      open={pastConversationsOpen}
      onOpenChange={setPastConversationsOpen}
      onSelect={setSelectConversationId}
      />
        <div className="flex flex-col h-full bg-sidebar">
          <div className="h-8.75 flex items-center justify-between border-b">
            <div className="text-sm truncate pl-3">
              {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
            </div>
            <div className="flex items-center px-1 gap-1">
              <Button
                size="icon-xs"
                variant="highlight"
                onClick={() => setPastConversationsOpen(true)}
              >
                <HistoryIcon className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="highlight"
                onClick={handleCreateConversation}
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </div>
          </div>
          <Conversation className="flex-1">
            <ConversationContent>
              {conversationMessage?.map((message, messageIndex) => (
                <Message key={message._id} from={message.role}>
                  <MessageContent>
                    {message.status === "processing" ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <LoaderIcon className="size-4 animate-spin" />
                        <span>Thinking....</span>
                      </div>
                    ) : message.status === "cancelled" ? (
                      <span className="text-muted-foreground italic pr-1">
                        Request cancelled
                      </span>
                    ) : (
                      <MessageResponse>{message.content}</MessageResponse>
                    )}
                  </MessageContent>
                  {message.role === "assistant" &&
                    message.status === "completed" &&
                    messageIndex === (conversationMessage?.length ?? 0) - 1 && (
                      <MessageActions>
                        <MessageAction
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                          }}
                          label="Copy"
                        >
                          <CopyIcon className="size-3" />
                        </MessageAction>
                      </MessageActions>
                    )}
                </Message>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="p-3">
            <PromptInput onSubmit={handleSubmit} className="mt-2">
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="Ask CodeGen to generate something..."
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                  disabled={isProcessing}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools />
                <PromptInputSubmit
                  disabled={isProcessing ? false : !input}
                  status={isProcessing ? "streaming" : undefined}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </>
    );
}