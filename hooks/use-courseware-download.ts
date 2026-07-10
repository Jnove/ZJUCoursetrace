/**
 * 课件/附件「点按打开」共享逻辑：命中缓存直接开；否则下载→写缓存→系统打开。
 * 成功返回 null，失败返回用户可读错误串（不 throw，调用方自行呈现）。
 */
import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSession, withRelogin, downloadCourseFile, type CoursewareFile } from "@/lib/zju-client";
import { getCachedFile, putCachedFile } from "@/lib/courseware-cache";
import { openCoursewareFile } from "@/lib/open-file";

export function useCoursewareDownload() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const openFile = async (
    file: CoursewareFile,
    courseId: number,
    allowPreview: boolean,
    courseName?: string
  ): Promise<string | null> => {
    if (downloadingId != null) return null;
    try {
      const username = (await AsyncStorage.getItem("username")) ?? "";
      const cached = await getCachedFile(username, file.id);
      if (cached) { await openCoursewareFile(cached); return null; }
      if (!file.allowDownload && !allowPreview) {
        return "老师未开放该课件下载（可在设置中开启「下载未开放课件」）";
      }
      setDownloadingId(file.id);
      const session = await loadSession();
      if (!session) return "请先登录";
      const uri = await withRelogin(session, () => downloadCourseFile(file, courseId, allowPreview));
      await putCachedFile(username, file.id, {
        uri,
        name: file.name || "未命名文件",
        courseId,
        courseName,
        size: file.size || undefined,
        at: Date.now(),
      });
      await openCoursewareFile(uri);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "下载失败，请重试";
    } finally {
      setDownloadingId(null);
    }
  };

  return { downloadingId, openFile };
}
