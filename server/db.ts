import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, courses, InsertCourse, Course, scheduleCache, InsertScheduleCache } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Course-related database operations

export async function saveCourses(userId: number, courseList: InsertCourse[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save courses: database not available");
    return;
  }

  try {
    // Delete existing courses for this user and semester
    if (courseList.length > 0) {
      const semester = courseList[0].semester;
      await db.delete(courses).where(and(eq(courses.userId, userId), eq(courses.semester, semester)));
    }

    // Insert new courses
    if (courseList.length > 0) {
      await db.insert(courses).values(courseList);
    }
  } catch (error) {
    console.error("[Database] Failed to save courses:", error);
    throw error;
  }
}

export async function getCoursesByUser(userId: number, semester?: string): Promise<Course[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get courses: database not available");
    return [];
  }

  try {
    const conditions = [eq(courses.userId, userId)];

    if (semester) {
      conditions.push(eq(courses.semester, semester));
    }

    const whereCondition = conditions.length > 1 ? and(...conditions) : conditions[0];
    const result = await db.select().from(courses).where(whereCondition);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get courses:", error);
    return [];
  }
}

export async function saveScheduleCache(
  userId: number,
  semester: string,
  rawData: string,
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save schedule cache: database not available");
    return;
  }

  try {
    // Check if cache exists
    const existing = await db
      .select()
      .from(scheduleCache)
      .where(and(eq(scheduleCache.userId, userId), eq(scheduleCache.semester, semester)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing cache
      await db
        .update(scheduleCache)
        .set({ rawData })
        .where(and(eq(scheduleCache.userId, userId), eq(scheduleCache.semester, semester)));
    } else {
      // Insert new cache
      await db.insert(scheduleCache).values({
        userId,
        semester,
        rawData,
      });
    }
  } catch (error) {
    console.error("[Database] Failed to save schedule cache:", error);
    throw error;
  }
}

export async function getScheduleCache(userId: number, semester: string): Promise<string | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get schedule cache: database not available");
    return null;
  }

  try {
    const result = await db
      .select()
      .from(scheduleCache)
      .where(and(eq(scheduleCache.userId, userId), eq(scheduleCache.semester, semester)))
      .limit(1);

    return result.length > 0 ? result[0].rawData : null;
  } catch (error) {
    console.error("[Database] Failed to get schedule cache:", error);
    return null;
  }
}

// TODO: add feature queries here as your schema grows.
