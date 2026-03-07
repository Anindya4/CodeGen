import ky from "ky";
import { Octokit } from "octokit";
import { isBinaryFile } from "isbinaryfile";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client-";
import { inngest } from "@/inngest/client";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";


interface ExportToGithubEvent {
  projectId: Id<"projects">;
  repoName: string;
  visibility: "public" | "private";
  githubToken: string;
  description?: string;
};

type FileWithUrl = Doc<"files"> & { storageUrl: string | null}


export const exportToGithub  = inngest.createFunction(
  {
    id: "export-to-github",
    cancelOn: [
      {
        event: "github/export.cancel",
        if : "event.data.projectId === async.data.pro"
      },
    ],
    onFailure: async ({ event, step }) => {
      const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
      if (!internalKey) return;
      
      const { projectId } = event.data.event.data as ExportToGithubEvent;

      await step.run("set-failed-status", async () => {
        await convex.mutation(api.system.updateExportStatus, {
          internalKey,
          projectId,
          status: "failed",
        });
      });
    }
  },
  {
    event:"github/export.repo"
  }, async ({ event, step }) => {
    const {
      projectId,
      repoName,
      visibility,
      description,
      githubToken,
    } = event.data as ExportToGithubEvent;
    
    const internalKey = process.env.CODEGEN_CONVEX_INTERNAL_KEY;
    if (!internalKey) {
      throw new NonRetriableError("CODEGEN_CONVEX_INTERNAL_KEY is not configured");
    };


    //set status to exporting
    await step.run("set-exporting-status", async () => {
      await convex.mutation(api.system.updateExportStatus, {
        internalKey,
        projectId,
        status: 'exporting',
      });
    });
    
    const octokit = new Octokit({ auth: githubToken });

    //get authenticated user
    const { data: user } = await step.run("get-github-user", async () => {
      return await octokit.rest.users.getAuthenticated()
    });

    //crate the new  repository with auto_init to have an initial commit
    const { data: repo } = await step.run("create-repo", async () => {
      return await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: description || `Exported from CodeGen`,
        private: visibility === "private",
        auto_init: true
      })
    });

    await step.sleep("wait-for-repo-init", "4s");

    // get the initial commit SHA
    const initialCommitSha = await step.run("get-initial-commit", async () => {
      const { data: ref } = await octokit.rest.git.getRef({
        owner: user.login,
        repo: repoName,
        ref: "heads/main",
      });
      return ref.object.sha;
    });


    //fetch all projects files with storage URLs (basically the binary files)
    const files = await step.run("fetch-project-files", async () => {
      return (await convex.query(api.system.getProjectFilesWithUrls, {
        internalKey,
        projectId,
      })) as FileWithUrl[]
    });

    //build a map of files IDs to their full paths
    const buildFilePaths = (files: FileWithUrl[]) => {
      const fileMap = new Map<Id<"files">, FileWithUrl>();
      files.forEach((f) => fileMap.set(f._id, f));

      const getFullPath = (file: FileWithUrl) : string => {
        if (!file.parentId) {
          return file.name
        }
        const parent = fileMap.get(file.parentId);
        if (!parent) return file.name

        return `${getFullPath(parent)}/${file.name}`;
      }
    }

  }
);