import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";
import { api } from "../../../../../convex/_generated/api";
import { convex } from "@/lib/convex-client-";

const requestSchema = z.object({
  url: z.url(),
});



function parseGithub(url: string) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
        throw new Error("Invalid GitHub URL");
    }

    return { owner: match[1], repo: match[2].replace(/\.git$/, "")};
};


export async function POST(request: Request) {
    const { userId, has } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status : 401 })
    };

    const hasPro = has({plan: "pro"});
    if (!hasPro){
        return NextResponse.json({error: "Pro plan is required for this feature"}, {status: 403})
    }

    const body = await request.json();
    const { url } = requestSchema.parse(body);

    const { owner, repo } = parseGithub(url)

    const client = await clerkClient();
    const getGithubTokens = await client.users.getUserOauthAccessToken(
        userId,
        "github"
    );

    const githubToken = getGithubTokens.data[0]?.token;
    if (!githubToken) {
        return NextResponse.json(
            { error: "GitHub is not connected. Please connect your GitHub account" },
            { status:400 }
        );
    };


    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
    if (!internalKey) {
        return NextResponse.json(
            { error : "Internal Key is not configured" },
            { status: 500 }
        )
    }


    const projectId = await convex.mutation(api.system.importProject, {
        internalKey,
        name: repo,
        ownerId: userId
    });

    const event = await inngest.send({
        name: "github/import.repo",
        data: {
            owner,
            repo,
            projectId,
            githubToken
        }
    });

    return NextResponse.json({
      success: true,
      projectId,
      eventId: event.ids[0],
    });
}