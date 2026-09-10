import { View, Text, FlatList, TouchableOpacity, Platform, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { CommonNavBar } from "@/components/common/nav-bar";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingView } from "@/components/common/loading-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import { listCachedFiles, removeCachedFile, type CachedCoursewareEntry } from "@/lib/courseware-cache";
import { openCoursewareFile } from "@/lib/open-file";

type Item = CachedCoursewareEntry & { uploadId: number };

function fmtSize(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(at?: number): string {
  if (!at) return "";
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function DownloadedCoursewareScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const username = (await AsyncStorage.getItem("username")) ?? "";
    const list = await listCachedFiles(username);
    setItems(list);
    setLoading(false);
  }, []);

  // 从课件页下载后返回本页时刷新列表
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = (item: Item) => {
    Alert.alert("删除课件", `删除「${item.name}」的本地文件？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          const username = (await AsyncStorage.getItem("username")) ?? "";
          await removeCachedFile(username, item.uploadId);
          load();
        },
      },
    ]);
  };

  const onOpen = async (item: Item) => {
    try {
      await openCoursewareFile(item.uri);
    } catch {
      Alert.alert("打开失败", "文件可能已损坏或没有可打开它的应用");
    }
  };

  if (Platform.OS === "web") {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title="已下载课件" />
        <EmptyState message="网页端暂不支持，请在手机 App 内查看" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <CommonNavBar title="已下载课件" />
      {loading ? (
        <LoadingView />
      ) : items.length === 0 ? (
        <EmptyState message="还没有下载过课件" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(f) => String(f.uploadId)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onOpen(item)}
              style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, cardShadow(scheme)]}
            >
              <IconSymbol name="square.and.arrow.down" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 15, fontWeight: "500" }}>{item.name}</Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {[item.courseName, fmtSize(item.size), fmtDate(item.at)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onDelete(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 4 }}
              >
                <IconSymbol name="trash.fill" size={20} color={colors.muted} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenContainer>
  );
}
