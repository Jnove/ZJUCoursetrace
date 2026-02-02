import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Courses table for storing schedule data
export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  courseId: varchar("courseId", { length: 255 }).notNull(),
  courseCode: varchar("courseCode", { length: 64 }).notNull(),
  courseName: text("courseName").notNull(),
  semester: varchar("semester", { length: 64 }).notNull(),
  teacher: text("teacher"),
  location: text("location"),
  timeSlot: text("timeSlot"),
  examTime: text("examTime"),
  examLocation: text("examLocation"),
  dayOfWeek: int("dayOfWeek"), // 1-7, 1=Monday
  isSingleWeek: mysqlEnum("isSingleWeek", ["single", "double", "both"]).default("both"),
  period: varchar("period", { length: 64 }), // e.g., "1-2"
  periodTime: varchar("periodTime", { length: 64 }), // e.g., "08:00-09:35"
  weekRange: varchar("weekRange", { length: 64 }), // e.g., "1-8"
  credit: int("credit"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

// User schedule cache table
export const scheduleCache = mysqlTable("scheduleCache", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  semester: varchar("semester", { length: 64 }).notNull(),
  rawData: text("rawData"), // Store raw schedule data as JSON
  lastUpdated: timestamp("lastUpdated").defaultNow().onUpdateNow().notNull(),
});

export type ScheduleCache = typeof scheduleCache.$inferSelect;
export type InsertScheduleCache = typeof scheduleCache.$inferInsert;
