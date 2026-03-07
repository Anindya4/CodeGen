import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";



const requestSchema = z.object({
    projectId: z.string(),
    repoName: z.string().min(1).max(50),
    visibility: z.enum(["public", "private"]).default("private"),
    description: z.string().max(350).optional()
})



export async function POST(request:Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, repoName, visibility, description } = requestSchema.parse(body);

  const client = await clerkClient();
  const getGithubTokens = await client.users.getUserOauthAccessToken(
    userId,
    "github",
  );

  const githubToken = getGithubTokens.data[0]?.token;
  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub is not connected. Please connect your GitHub account" },
      { status: 400 },
    );
  };

  const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal Key is not configured" },
      { status: 500 },
    );
  };

  const event = await inngest.send({
    name: "github/export.repo",
    data: {
      projectId,
      repoName,
      visibility,
      description,
      githubToken,
      internalKey,
    },
  });

  return NextResponse.json({ 
      success: true, 
      projectId, 
      eventId: event.ids[0],
    });

} 