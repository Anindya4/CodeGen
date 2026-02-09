import { generateText } from "ai";
import { inngest } from "./client";
import { google } from "@ai-sdk/google";


export const demoGenerate = inngest.createFunction(
  { id: "demo-generate" },
  { event: "demo/generate" },
  async ({ step }) => {
    return await generateText({
      model: google("gemini-2.5-flash"),
      prompt: "Write the recipe for Butter Chicken",
    });
  },
);
