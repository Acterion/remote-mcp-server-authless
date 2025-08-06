import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const studyItems = sqliteTable('study_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  content: text('content').notNull(),
  level: text('level', { enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'easy', 'medium', 'hard'] }).notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  recallStrength: text('recall_strength', { enum: ['strong', 'medium', 'weak'] }).notNull().default('weak'),
  lastReviewed: integer('last_reviewed'),
  nextReview: integer('next_review').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
}, (table) => ({
  userIdIdx: index('user_id_idx').on(table.userId),
  nextReviewIdx: index('next_review_idx').on(table.nextReview),
  typeIdx: index('type_idx').on(table.type),
  levelIdx: index('level_idx').on(table.level),
  userNextReviewIdx: index('user_next_review_idx').on(table.userId, table.nextReview),
}));