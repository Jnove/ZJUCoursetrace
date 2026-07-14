import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { CommonNavBar } from "@/components/common/nav-bar";
import { SearchInput } from "@/components/common/search-input";
import { ErrorCard } from "@/components/common/error-card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingView } from "@/components/common/loading-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import {
  loadSession, withRelogin,
  fetchCourseFiles, resolveCourseId,
  type CoursewareFile,
} from "@/lib/zju-client";
import { useCoursewareDownload } from "@/hooks/use-courseware-download";

function fmtSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function CoursewareScreen() {
  const { courseId: courseIdParam, courseName } = useLocalSearchParams<{ courseId?: string; courseName?: string }>();
  const colors = useColors();
  const scheme = useColorScheme();
  const [files, setFiles] = useState<CoursewareFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowPreview, setAllowPreview] = useState(false);
  const [resolvedCourseId, setResolvedCourseId] = useState(0);
  const [query, setQuery] = useState("");
  const { downloadingId, openFile } = useCoursewareDownload();

  const kw = query.trim().toLowerCase();
  const shown = kw ? files.filter((f) => (f.name || "").toLowerCase().includes(kw)) : files;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setAllowPreview((await AsyncStorage.getItem("pref_courseware_preview")) === "1");
      const session = await loadSession();
      if (!session) throw new Error("请先登录");
      let id = courseIdParam ? Number(courseIdParam) : NaN;
      if (!id || Number.isNaN(id)) {
        const resolved = await withRelogin(session, () => resolveCourseId(courseName ?? ""));
        if (!resolved) throw new Error("未找到该课程的课件（可能不在学在浙大开课）");
        id = resolved.id;
      }
      setResolvedCourseId(id);
      const list = await withRelogin(session, () => fetchCourseFiles(id));
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载课件失败");
    } finally {
      setLoading(false);
    }
  }, [courseIdParam, courseName]);

  useEffect(() => { load(); }, [load]);

  const onTapFile = async (file: CoursewareFile) => {
    const err = await openFile(file, resolvedCourseId, allowPreview, courseName);
    if (err) setError(err);
  };

  if (Platform.OS === "web") {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title={courseName ?? "课件"} />
        <EmptyState message="网页端暂不支持，请在手机 App 内查看课件" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <CommonNavBar title={courseName ?? "课件"} />
      {loading ? (
        <LoadingView />
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <ErrorCard message={error} onRetry={load} />
        </View>
      ) : files.length === 0 ? (
        <EmptyState message="暂无课件，老师还没有上传课件" />
      ) : (
        <>
          {/* 搜索框固定在 FlatList 之外（放 ListHeaderComponent 会因虚拟化
              卸载导致输入框失焦、键盘反复弹出收起） */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SearchInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索课件"
              style={{ backgroundColor: colors.background }}
            />
          </View>
          <FlatList
            data={shown}
            keyExtractor={(f) => String(f.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, flexGrow: 1 }}
            ListEmptyComponent={<EmptyState message="未找到匹配的课件" />}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onTapFile(item)}
                style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, cardShadow(scheme)]}
              >
                <IconSymbol name="list.bullet" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 15, fontWeight: "500" }}>{item.name || "未命名文件"}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                    {[fmtSize(item.size), item.allowDownload ? "" : "未开放"].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {downloadingId === item.id ? <ActivityIndicator color={colors.primary} /> : <IconSymbol name="square.and.arrow.down" size={22} color={colors.muted} />}
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </ScreenContainer>
  );
}
