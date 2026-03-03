"use client"

import {
    CommandDialog,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";

import { formatDistanceToNow } from "date-fns";
import { useConversations } from "../hooks/use-conversations";
import { Id } from "../../../../convex/_generated/dataModel";
import { CommandGroup } from "cmdk";



interface PastConversationDialogProps {
    projectId: Id<"projects">
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (conversationId: Id<"conversations">) => void 
};

export const PastConversationDialog = ({
    projectId,
    open,
    onOpenChange,
    onSelect,
}: PastConversationDialogProps) => {
    const conversation = useConversations(projectId);

    const handleSelect = (conversationId: Id<"conversations">) => {
        onSelect(conversationId);
        onOpenChange(false)
    };

    return (
      <CommandDialog
        onOpenChange={onOpenChange}
        open={open}
        title="Conversation History"
        description="Search and select a past conversation"
      >
        <CommandInput placeholder="Search Conversations..." />
        <CommandList>
          <CommandEmpty>No conversation found.</CommandEmpty>
          <CommandGroup heading="Conversations">
            {conversation?.map((conversation) => (
              <CommandItem
                key={conversation._id}
                value={`${conversation.title}-${conversation._id}`}
                onSelect={() => handleSelect(conversation._id)}
              >
                <div className="flex flex-col gap-0.5">
                  <span>{conversation.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(conversation._creationTime, {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
}