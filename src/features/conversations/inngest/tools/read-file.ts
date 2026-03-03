import { convex } from "@/lib/convex-client-";
import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";


interface ReadFileToolOptions {
    internalKey: string;
};



const paramsSchema = z.object({
    fileIds: z.array(
        z.string().min(1, "File ID cannot be empty")
    ).min(1, "Please provide at least one file ID")
});

export const createReadFileTool = ({ internalKey } : ReadFileToolOptions) => {
    return createTool({
        name: "readFiles",
        description: "Read the content of files from the project. Return file contents",
        parameters: z.object({
            fileIds : z.array(z.string()).describe("Array fo file IDs to read"),
        }),
        handler: async (params, {step: toolStep}) => {
            const parsed = paramsSchema.safeParse(params);
            if(!parsed.success) return `Error: ${parsed.error.issues[0].message}`

            const { fileIds } = parsed.data;

            try {
                return await toolStep?.run("read-files", async () => {
                    const results: {id: string; name: string; content: string} []= [];

                    for (const fileId of fileIds) {
                        const file = await convex.query(api.system.getFileById, {
                            internalKey,
                            fileId: fileId as Id<"files">,
                        });

                        if (file && file.content) {
                            results.push({
                                id: file._id,
                                name: file.name,
                                content: file.content,
                            });
                        };
                    };

                    if (results.length === 0) {
                        return "Error: NO files found with provided IDs, Use listFiles to get valid fileIds."
                    }

                    return JSON.stringify(results);
                });
            } catch (error) {
                return `Error reading files: ${error instanceof Error ? error.message : "Unknown Error"}`;
            }

        }
    });
};