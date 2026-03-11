import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifyAuth } from "./auth";

const FREE_CALL_LIMIT = 5;

const getCurrentWeekStart = (): number => {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime();
};

export const getMyWeeklyUsage = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);
    const weekStart = getCurrentWeekStart();

    const record = await ctx.db
      .query("userUsage")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", identity.subject).eq("weekStartDate", weekStart),
      )
      .unique();

    const callCount = record?.callCount ?? 0;
    return {
      callCount,
      remaining: Math.max(0, FREE_CALL_LIMIT - callCount),
    };
  },
});


export const updateSettings = mutation({
  args: {
    id: v.id("projects"),
    settings: v.object({
      installCommand: v.optional(v.string()),
      devCommand: v.optional(v.string()),
    })
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id)
    if (!project) throw new Error("Project not found");

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to update this project");
    }

    await ctx.db.patch("projects", args.id, {
      settings: args.settings,
      updateAt: Date.now()
    });
  }
});





export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: identity.subject,
      updateAt: Date.now(),
    });
    return projectId;
  },
});

export const getPartial = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(args.limit);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});


export const getById = query({
  args: {
    id: v.id("projects")
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    
    const project = await ctx.db.get("projects", args.id)
    
    if (!project) {
      throw new Error("Project not found!");
    }

    if (project.ownerId !== identity.subject){
      throw new Error("Unauthorized access to this project!")
    }

    return project;
  },
});


export const rename = mutation({
  args: {
    id: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) {
      throw new Error("Project not found!");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    await ctx.db.patch("projects", args.id, {
      name: args.name,
      updateAt: Date.now(),
    })
  },
});
