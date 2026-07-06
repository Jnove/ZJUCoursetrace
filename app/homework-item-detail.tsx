import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { CommonNavBar } from "@/components/common/nav-bar";
import { ErrorCard } from "@/components/common/error-card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingView } from "@/components/common/loading-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import { loadSession, withRelogin, fetchHomeworkDetail, type HomeworkDetail, type CoursewareFile } from "@/lib/zju-client";
import { useCoursewareDownload } from "@/hooks/use-courseware-download";

export default function HomeworkItemDetailScreen() {
  const { homeworkId, courseId, title } = useLocalSearchParams<{
    homeworkId?: string;
    courseId?: string;
    title?: string;
  }>();
  const colors = useColors();
  const scheme = useColorScheme();
  const [detail, setDetail] = useState<HomeworkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowPreview, setAllowPreview] = useState(false);
  const { downloadingId, openFile } = useCoursewareDownload();

  const navTitle = title ?? "作业详情";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAllowPreview((await AsyncStorage.getItem("pref_courseware_preview")) === "1");
      const session = await loadSession();
      if (!session) throw new Error("请先登录");
      const d = await withRelogin(session, () => fetchHomeworkDetail(Number(homeworkId)));
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载作业详情失败");
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => {
    load();
  }, [load]);

  const onTapAttachment = async (att: CoursewareFile) => {
    const err = await openFile(att, Number(courseId), allowPreview);
    if (err) setError(err);
  };

  if (Platform.OS === "web") {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title={navTitle} />
        <EmptyState message="网页端暂不支持，请在手机 App 内查看作业详情" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <CommonNavBar title={navTitle} />
      {loading ? (
        <LoadingView />
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <ErrorCard message={error} onRetry={load} />
        </View>
      ) : (
        detail && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 16 }, cardShadow(scheme)]}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
                {detail.title}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 22 }}>
                {detail.bodyText || "（无题目描述）"}
              </Text>
            </View>

            {detail.attachments.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>附件</Text>
                {detail.attachments.map((att) => (
                  <TouchableOpacity
                    key={att.id}
                    activeOpacity={0.7}
                    onPress={() => onTapAttachment(att)}
                    style={[
                      {
                        backgroundColor: colors.surface,
                        borderRadius: 12,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      },
                      cardShadow(scheme),
                    ]}
                  >
                    <IconSymbol name="square.and.arrow.down" size={18} color={colors.violet} />
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 14 }}>
                      {att.name || "未命名附件"}
                    </Text>
                    {downloadingId === att.id ? (
                      <ActivityIndicator color={colors.violet} />
                    ) : (
                      <IconSymbol name="chevron.right" size={18} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {(detail.score || detail.comment) && (
              <View style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 8 }, cardShadow(scheme)]}>
                {detail.score && (
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>得分：{detail.score}</Text>
                )}
                {detail.comment && (
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>评语：{detail.comment}</Text>
                )}
              </View>
            )}
          </ScrollView>
        )
      )}
    </ScreenContainer>
  );
}
