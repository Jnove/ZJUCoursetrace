/**
 * 用系统方式打开本地文件：Android → ACTION_VIEW（各类阅读器）；
 * iOS/其他 → 分享面板。模式同 lib/ics-export.ts。
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  txt: "text/plain",
};

function mimeOf(fileUri: string): string {
  const ext = fileUri.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export async function openCoursewareFile(fileUri: string): Promise<void> {
  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: mimeOf(fileUri),
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return;
    } catch {
      // 无可处理该类型的应用 → 回退分享
    }
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("当前设备不支持打开该文件");
  await Sharing.shareAsync(fileUri, { mimeType: mimeOf(fileUri) });
}
