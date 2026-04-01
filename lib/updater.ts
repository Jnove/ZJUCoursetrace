/**
 *
 * GitHub Releases update checker.
 *
 * Usage:
 *   const result = await checkForUpdate();
 *   if (result.hasUpdate) { ... result.latestVersion, result.downloadUrl }
 *
 * On Android: downloads the APK via expo-file-system and triggers an install
 *             intent via expo-intent-launcher.
 * On iOS:     opens the GitHub release page in the browser (no sideloading).
 * On Web:     opens the release page URL.
 *
 */

import { Platform, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";

export const GITHUB_OWNER = "Jnove";
export const GITHUB_REPO = "ZJUCoursetrace";

/**
 * The asset name pattern to look for in a release's assets list.
 * Should match the APK file you attach to each GitHub release.
 * Adjust if your naming convention differs.
 */
const APK_ASSET_PATTERN = /\.apk$/i;
// ─── ↑ YOUR DETAILS HERE ─────────────────────────────────────────────────────

export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// ─── Version comparison ───────────────────────────────────────────────────────

/** Strips leading "v" and splits into numeric parts. */
function parseVersion(v: string): number[] {
  return v.replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
}

/**
 * Returns true if `remote` is strictly newer than `local`.
 * Compares major.minor.patch numerically.
 */
export function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const ri = r[i] ?? 0;
    const li = l[i] ?? 0;
    if (ri > li) return true;
    if (ri < li) return false;
  }
  return false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UpdateCheckResult =
  | { hasUpdate: false; currentVersion: string; latestVersion: string }
  | {
    hasUpdate: true;
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;      // GitHub release page URL
    downloadUrl: string | null; // Direct APK download URL (Android only)
    releaseNotes: string | null;
  };

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the latest GitHub release and compares it to the running version.
 * Throws on network error so the caller can show an error state.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";

  const res = await fetch(API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!res.ok) {
    throw new Error(`GitHub API 返回 ${res.status}，请稍后重试`);
  }

  const data = await res.json();
  const latestVersion: string = data.tag_name ?? "0.0.0";
  const releaseUrl: string = data.html_url ?? RELEASES_URL;
  const releaseNotes: string | null = data.body ?? null;

  if (!isNewer(latestVersion, currentVersion)) {
    return { hasUpdate: false, currentVersion, latestVersion };
  }

  // Find APK asset URL for Android
  const assets: any[] = data.assets ?? [];
  const apkAsset = assets.find((a: any) => APK_ASSET_PATTERN.test(a.name));
  const downloadUrl: string | null = apkAsset?.browser_download_url ?? null;

  return {
    hasUpdate: true,
    currentVersion,
    latestVersion,
    releaseUrl,
    downloadUrl: Platform.OS === "android" ? downloadUrl : null,
    releaseNotes,
  };
}

// ─── Install helpers ──────────────────────────────────────────────────────────

export type DownloadProgress = {
  bytesDownloaded: number;
  bytesTotal: number;
  fraction: number;   // 0..1
};

/**
 * Downloads the APK to the device's cache and triggers the system install UI.
 * Only works on Android with the APK download URL from checkForUpdate().
 *
 * @param downloadUrl  browser_download_url from the GitHub release asset
 * @param onProgress   optional progress callback (0..1)
 */
export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("APK 安装仅支持 Android 设备");
  }

  // Android 8+ 需要检查"安装未知来源应用"的权限
  try {
    const { resultCode } = await IntentLauncher.startActivityAsync(
      "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
      // 检测能否打开该 intent
    );
  } catch {
    // 不支持该 intent 的旧设备忽略
  }

  const destPath = FileSystem.cacheDirectory + "update.apk";

  const info = await FileSystem.getInfoAsync(destPath);
  if (info.exists) await FileSystem.deleteAsync(destPath, { idempotent: true });

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    destPath,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (onProgress) {
        onProgress({
          bytesDownloaded: totalBytesWritten,
          bytesTotal: totalBytesExpectedToWrite,
          fraction: totalBytesExpectedToWrite > 0
            ? totalBytesWritten / totalBytesExpectedToWrite
            : 0,
        });
      }
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) throw new Error("下载失败，请重试");

  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  try {
    await IntentLauncher.startActivityAsync(
      "android.intent.action.VIEW",
      {
        data: contentUri,
        flags: 1,// FLAG_GRANT_READ_URI_PERMISSION
        type: "application/vnd.android.package-archive",
      },
    );
  } catch (e: any) {
    // 没有权限时，引导用户去设置页开启"安装未知应用"
    if (e?.message?.includes("Permission") || e?.message?.includes("permission")) {
      throw new Error(
        "没有安装权限。请前往「设置 → 应用(或隐私与安全) → 特殊应用权限 → 安装未知应用」，找到本应用并开启权限后重试。"
      );
    }
    throw e;
  }
}

/**
 * Opens the GitHub releases page in the system browser.
 * Used on iOS and web, or as a fallback when no APK asset is attached.
 */
export async function openReleasePage(url: string = RELEASES_URL): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}