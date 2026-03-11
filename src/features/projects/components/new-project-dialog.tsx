"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import ky, { HTTPError } from 'ky'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage
} from "@/components/ai-elements/prompt-input";

import { Id } from "../../../../convex/_generated/dataModel";
import { useWeeklyUsage } from "../hooks/use-projects";
import { useClerk } from "@clerk/nextjs";


interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open:boolean) => void
};



export const NewProjectDialog = ({
  open,
  onOpenChange
}: NewProjectDialogProps) => {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usage = useWeeklyUsage();
  const { openUserProfile } = useClerk();
  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim()) return;

    if (usage && usage.remaining === 0) {
      toast.error(
        "You've used all 5 free calls this week. Upgrade to Pro for unlimited access.",
        {
          action: {
            label: "Upgrade",
            onClick: () => openUserProfile(),
          },
        },
      );
      onOpenChange(false)
      setInput("")
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await ky.post("/api/projects/create-with-prompts", {
        json: { prompt: message.text.trim() },
      }).json<{ projectId: Id<"projects">; remaining: number | null }>();

      toast.success("Project Created");
      onOpenChange(false);
      setInput("");
      router.push(`/projects/${res.projectId}`)
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 429) {
        toast.error("You've used all 5 free calls this week. Upgrade to Pro for unlimited access.",
          {
            action : {
              label: "Upgrade",
              onClick: () => openUserProfile()
            }
          }
        );
      } else {
        toast.error("Unable to create projects");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0">
        <DialogHeader className="hidden">
          <DialogTitle>What do you want to build?</DialogTitle>
          <DialogDescription>
            Describe your project and AI will help you create it.
          </DialogDescription>
        </DialogHeader>
        <PromptInput onSubmit={handleSubmit} className="border-none!">
          <PromptInputBody>
            <PromptInputTextarea
            placeholder="Ask CodeGen to build..."
            onChange={(e) => setInput(e.target.value)}
            value={input}
            disabled={isSubmitting}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools/>
            <PromptInputSubmit disabled={!input || isSubmitting} />
          </PromptInputFooter>
        </PromptInput>
      </DialogContent>
    </Dialog>
  );
};