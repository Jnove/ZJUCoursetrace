import axios, { type AxiosInstance } from "axios";
import { AXIOS_TIMEOUT_MS } from "../../shared/const.js";

/**
 * CAS Authentication Service for Zhejiang University
 * Handles login and session management with ZJU's CAS system
 */

export interface CASLoginResponse {
  success: boolean;
  message?: string;
  sessionId?: string;
  username?: string;
}

export interface ScheduleData {
  courses: CourseInfo[];
  semester: string;
  lastUpdated: string;
}

export interface CourseInfo {
  courseId: string;
  courseCode: string;
  courseName: string;
  semester: string;
  teacher: string;
  location: string;
  timeSlot: string;
  examTime?: string;
  examLocation?: string;
  dayOfWeek?: number;
  isSingleWeek?: "single" | "double" | "both";
  period?: string;
  periodTime?: string;
  weekRange?: string;
  credit?: number;
}

class CASService {
  private client: AxiosInstance;
  private baseUrl = "https://zdbk.zju.edu.cn";
  private casUrl = "https://zjuam.zju.edu.cn/cas";

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: AXIOS_TIMEOUT_MS,
      withCredentials: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
  }

  /**
   * Authenticate user with CAS credentials
   * Note: This is a placeholder. In production, you would need to:
   * 1. Use Selenium or Puppeteer to automate the CAS login process
   * 2. Or integrate with a backend service that handles CAS authentication
   */
  async login(username: string, password: string): Promise<CASLoginResponse> {
    try {
      // This is a simplified version. The actual implementation would need to:
      // 1. Navigate to CAS login page
      // 2. Submit credentials
      // 3. Handle redirects and capture session cookies
      // 4. Verify successful authentication

      // For now, we'll return a placeholder response
      // In production, this would call a service that uses Selenium/Puppeteer
      return {
        success: true,
        message: "Authentication successful",
        username: username,
      };
    } catch (error) {
      console.error("[CAS] Login error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  }

  /**
   * Get schedule data for a user
   * This would integrate with the Python script that scrapes schedule data
   */
  async getSchedule(username: string, sessionId?: string): Promise<ScheduleData> {
    try {
      // This would call the Python script or a service endpoint
      // that returns parsed schedule data
      // For now, returning placeholder data
      return {
        courses: [],
        semester: new Date().getFullYear() + "-" + (new Date().getFullYear() + 1) + "-1",
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[CAS] Get schedule error:", error);
      throw error;
    }
  }

  /**
   * Parse course time information to extract day of week and period
   */
  parseTimeInfo(
    timeSlot: string,
    periodInfo: string,
  ): {
    dayOfWeek?: number;
    period?: string;
    periodTime?: string;
    weekRange?: string;
    isSingleWeek?: "single" | "double" | "both";
  } {
    // This would parse the time slot information
    // Example: "秋冬 第1-8周" -> extract week range
    // Example: "周一 1-2节" -> extract day of week and period

    const result: {
      dayOfWeek?: number;
      period?: string;
      periodTime?: string;
      weekRange?: string;
      isSingleWeek?: "single" | "double" | "both";
    } = {};

    // Parse day of week
    const dayMap: Record<string, number> = {
      周一: 1,
      周二: 2,
      周三: 3,
      周四: 4,
      周五: 5,
      周六: 6,
      周日: 7,
    };

    for (const [day, num] of Object.entries(dayMap)) {
      if (timeSlot.includes(day)) {
        result.dayOfWeek = num;
        break;
      }
    }

    // Parse period (e.g., "1-2" from "1-2节")
    const periodMatch = periodInfo.match(/(\d+)-(\d+)/);
    if (periodMatch) {
      result.period = `${periodMatch[1]}-${periodMatch[2]}`;
    }

    // Parse week range (e.g., "1-8" from "第1-8周")
    const weekMatch = timeSlot.match(/第(\d+)-(\d+)周/);
    if (weekMatch) {
      result.weekRange = `${weekMatch[1]}-${weekMatch[2]}`;
    }

    // Determine if single week or double week
    if (timeSlot.includes("单周")) {
      result.isSingleWeek = "single";
    } else if (timeSlot.includes("双周")) {
      result.isSingleWeek = "double";
    } else {
      result.isSingleWeek = "both";
    }

    return result;
  }
}

export const casService = new CASService();
