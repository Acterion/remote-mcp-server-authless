import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { studyItems } from "./db/schema.js";
import { calculateNextReview, generateId } from "./utils/spaced-repetition.js";
import { eq, and, lte, desc, asc } from "drizzle-orm";
import type { Env } from "./types.js";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Learning Assistant",
		version: "1.0.0",
	});

	async init() {
		const db = drizzle((this.env as Env).DB);

		// Create a new study item
		this.server.tool(
			"create_study_item",
			"Create a new study item for learning with spaced repetition scheduling",
			{
				userId: z.string().describe("User ID"),
				type: z.string().describe("Type of study item (e.g., vocab, grammar)"),
				content: z.string().describe("The content to study"),
				level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'easy', 'medium', 'hard']).describe("Difficulty level"),
				tags: z.array(z.string()).optional().describe("Tags for categorization"),
				notes: z.string().optional().describe("Optional notes"),
			},
			async ({ userId, type, content, level, tags = [], notes }) => {
				try {
					const id = generateId();
					const nextReview = calculateNextReview('weak');
					
					await db.insert(studyItems).values({
						id,
						userId,
						type,
						content,
						level,
						tags,
						nextReview: Math.floor(nextReview.getTime() / 1000),
						notes,
					});

					return {
						content: [{ type: "text", text: JSON.stringify({ id, success: true }) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify({ error: String(error), success: false }) }],
					};
				}
			}
		);

		// Update study performance
		this.server.tool(
			"update_study_performance",
			"Update performance/recall strength for a study item and reschedule next review",
			{
				id: z.string().describe("Study item ID"),
				userId: z.string().describe("User ID"),
				recallStrength: z.enum(['weak', 'medium', 'strong']).describe("How well the user recalled this item"),
			},
			async ({ id, userId, recallStrength }) => {
				try {
					const nextReview = calculateNextReview(recallStrength);
					const now = Math.floor(Date.now() / 1000);
					const nowDate = new Date();

					await db.update(studyItems)
						.set({
							recallStrength,
							lastReviewed: now,
							nextReview: Math.floor(nextReview.getTime() / 1000),
							updatedAt: nowDate,
						})
						.where(and(eq(studyItems.id, id), eq(studyItems.userId, userId)));

					return {
						content: [{ type: "text", text: JSON.stringify({ success: true }) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify({ error: String(error), success: false }) }],
					};
				}
			}
		);

		// Search study items
		this.server.tool(
			"search_study_items",
			"Search and filter study items by content, tags, type, or difficulty level",
			{
				userId: z.string().describe("User ID"),
				content: z.string().optional().describe("Search by content similarity"),
				tags: z.array(z.string()).optional().describe("Search by tags"),
				type: z.string().optional().describe("Filter by type"),
				level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'easy', 'medium', 'hard']).optional().describe("Filter by level"),
			},
			async ({ userId, content, tags, type, level }) => {
				try {
					const conditions = [eq(studyItems.userId, userId)];

					if (type) {
						conditions.push(eq(studyItems.type, type));
					}

					if (level) {
						conditions.push(eq(studyItems.level, level));
					}

					const results = await db.select().from(studyItems)
						.where(and(...conditions))
						.orderBy(desc(studyItems.updatedAt));

					// Simple filtering for content and tags (in production, consider full-text search)
					let filteredResults = results;

					if (content) {
						filteredResults = filteredResults.filter(item => 
							item.content.toLowerCase().includes(content.toLowerCase())
						);
					}

					if (tags && tags.length > 0) {
						filteredResults = filteredResults.filter(item => 
							tags.some(tag => item.tags?.includes(tag) || false)
						);
					}

					return {
						content: [{ type: "text", text: JSON.stringify(filteredResults) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify({ error: String(error), success: false }) }],
					};
				}
			}
		);

		// Get items for review
		this.server.tool(
			"get_items_for_review",
			"Get study items that are due for review based on spaced repetition algorithm",
			{
				userId: z.string().describe("User ID"),
				recallStrength: z.enum(['weak', 'medium', 'strong']).optional().describe("Filter by recall strength"),
				dueBefore: z.string().optional().describe("Get items due before this date (ISO string)"),
			},
			async ({ userId, recallStrength, dueBefore }) => {
				try {
					const now = Math.floor(Date.now() / 1000);
					const dueBeforeTimestamp = dueBefore ? Math.floor(new Date(dueBefore).getTime() / 1000) : now;

					const conditions = [
						eq(studyItems.userId, userId),
						lte(studyItems.nextReview, dueBeforeTimestamp)
					];

					if (recallStrength) {
						conditions.push(eq(studyItems.recallStrength, recallStrength));
					}

					const results = await db.select().from(studyItems)
						.where(and(...conditions))
						.orderBy(asc(studyItems.nextReview));

					return {
						content: [{ type: "text", text: JSON.stringify(results) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify({ error: String(error), success: false }) }],
					};
				}
			}
		);

		// Get study types
		this.server.tool(
			"get_study_types",
			"Get all unique study item types for the user (e.g., vocabulary, grammar, concepts)",
			{
				userId: z.string().describe("User ID"),
			},
			async ({ userId }) => {
				try {
					const results = await db.selectDistinct({ type: studyItems.type })
						.from(studyItems)
						.where(eq(studyItems.userId, userId));

					const types = results.map(r => r.type);

					return {
						content: [{ type: "text", text: JSON.stringify(types) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify({ error: String(error), success: false }) }],
					};
				}
			}
		);

		// Get learning stats
		this.server.tool(
			"get_learning_stats",
			"Get comprehensive learning statistics and progress overview for the user",
			{
				userId: z.string().describe("User ID"),
			},
			async ({ userId }) => {
				try {
					const allItems = await db.select().from(studyItems).where(eq(studyItems.userId, userId));
					const now = Math.floor(Date.now() / 1000);

					const stats = {
						total: allItems.length,
						byRecallStrength: {
							weak: allItems.filter(item => item.recallStrength === 'weak').length,
							medium: allItems.filter(item => item.recallStrength === 'medium').length,
							strong: allItems.filter(item => item.recallStrength === 'strong').length,
						},
						byLevel: {} as Record<string, number>,
						byType: {} as Record<string, number>,
						dueForReview: allItems.filter(item => item.nextReview <= now).length,
						reviewedToday: allItems.filter(item => 
							item.lastReviewed && item.lastReviewed >= now - 86400
						).length,
					};

					// Count by level
					allItems.forEach(item => {
						stats.byLevel[item.level] = (stats.byLevel[item.level] || 0) + 1;
					});

					// Count by type
					allItems.forEach(item => {
						stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
					});

					return {
						content: [{ type: "text", text: JSON.stringify(stats) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: JSON.stringify({ error: String(error), success: false }) }],
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
