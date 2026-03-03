import { convex } from "@/lib/convex-client-";
import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";


interface UpdateFileToolOptions {
  internalKey: string;
};



const paramsSchema = z.object({
        fileId: z.string().min(1, "File ID cannot be empty"),
        content: z.string().min(1, "File content cannot be empty"),
});




export const createUpdateFileTool = ({ internalKey }: UpdateFileToolOptions) => {
  return createTool({
    name: "updateFile",
    description: "Update the content of files in the project. Returns updated file details.",
    parameters: z.object({
      fileId: z.string().describe("The ID of the file to update"),
      content: z.string().describe("The new content to write to the file"),
    }),

    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) return `Error: ${parsed.error.issues[0].message}`;

      const { fileId, content } = parsed.data;

      const file = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: fileId as Id<"files">
      });

      if (!file) return `Error: File with ID "${fileId}" not found. Use listFiles to get valid file IDs.`;

      if (file.type === "folder") {
        return `Error: ${fileId} is a folder. You can ONLY update a files content.`
      };

      try {
        return await toolStep?.run("update-files", async () => {
            await convex.mutation(api.system.updateFile, {
              internalKey,
              fileId: fileId as Id<"files">,
              content,
            });

            return `File "${file.name}" updated successfully`
        });
      } catch (error) {
        return `Error updating files: ${error instanceof Error ? error.message : "Unknown Error"}`;
      }
    },
  });
};