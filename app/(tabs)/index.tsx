import { ScrollView, Text, View, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { getApiBaseUrl } from "@/constants/oauth";

interface TodaysCourse {
  course_name: string;
  location: string;
  period_time: string;
  teacher: string;
  day_of_week: number;
}

export default function HomeScreen() {
  const { state: authState, signIn, signOut } = useAuth();
  const { state: scheduleState, fetchSchedule } = useSchedule();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [todaysCourses, setTodaysCourses] = useState<TodaysCourse[]>([]);

  // 获取当天课程
  useEffect(() => {
    if (authState.userToken && scheduleState.courses.length > 0) {
      fetchTodaysCourses();
    }
  }, [authState.userToken, scheduleState.courses]);

  const fetchTodaysCourses = async () => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const username = authState.username;
      if (!username) {
        console.error("未找到用户名，无法获取今日课程");
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/api/schedule/todays-courses?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (data.success && data.courses) {
        setTodaysCourses(data.courses);
        console.log(`✅ 获取到 ${data.courses.length} 门今日课程`);
        if (data.semester_info) {
          console.log(`当前学期: ${data.semester_info.school_year} ${data.semester_info.semester}，第${data.semester_info.week}周`);
        }
      }
    } catch (err) {
      console.error("获取当天课程失败:", err);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("请输入学号和密码");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await signIn(username, password);
      // 登录成功后获取课表
      await fetchSchedule();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUsername("");
      setPassword("");
      router.push("/(tabs)/schedule");
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : "登录失败，请检查学号和密码");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUsername("");
      setPassword("");
      setError("");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // 已登录状态 - 显示用户信息和课表统计
  if (authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-background">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View className="flex-1 gap-6 p-6">
            {/* 欢迎区域 */}
            <View className="items-center gap-2">
              <Text className="text-3xl font-bold text-foreground">欢迎回来</Text>
              <Text className="text-base text-muted">{authState.username}</Text>
            </View>

            {/* 当天课程 */}
            <View className="gap-3">
              <Text className="text-lg font-semibold text-foreground">今天的课程</Text>
              {todaysCourses.length > 0 ? (
                <View className="gap-2">
                  {todaysCourses.map((course, index) => (
                    <View
                      key={index}
                      className="bg-surface border border-border rounded-lg p-4"
                    >
                      <Text className="text-base font-semibold text-foreground mb-1">
                        {course.course_name}
                      </Text>
                      <Text className="text-sm text-muted mb-1">
                        ⏰ {course.period_time}
                      </Text>
                      <Text className="text-sm text-muted mb-1">
                        📍 {course.location}
                      </Text>
                      <Text className="text-xs text-muted">
                        👨‍🏫 {course.teacher}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="bg-surface border border-border rounded-lg p-4 items-center">
                  <Text className="text-muted text-sm">今天没有课程</Text>
                </View>
              )}
            </View>

            {/* 当日课表预览 */}
            {todaysCourses.length > 0 && (
              <View className="gap-3 mt-2">
                <Text className="text-lg font-semibold text-foreground">当日课表</Text>
                <View className="bg-surface border border-border rounded-lg overflow-hidden">
                  <View className="flex-row bg-primary/10 border-b border-border">
                    <View className="flex-1 p-3 items-center">
                      <Text className="text-xs font-semibold text-muted">时间</Text>
                    </View>
                    <View className="flex-1 p-3 items-center border-l border-border">
                      <Text className="text-xs font-semibold text-muted">课程</Text>
                    </View>
                    <View className="flex-1 p-3 items-center border-l border-border">
                      <Text className="text-xs font-semibold text-muted">地点</Text>
                    </View>
                  </View>
                  {todaysCourses.map((course, index) => (
                    <View key={index} className="flex-row border-b border-border last:border-b-0">
                      <View className="flex-1 p-3 items-center justify-center">
                        <Text className="text-xs text-foreground font-semibold">{course.period_time}</Text>
                      </View>
                      <View className="flex-1 p-3 items-center justify-center border-l border-border">
                        <Text className="text-xs text-foreground text-center" numberOfLines={2}>
                          {course.course_name}
                        </Text>
                      </View>
                      <View className="flex-1 p-3 items-center justify-center border-l border-border">
                        <Text className="text-xs text-muted text-center" numberOfLines={2}>
                          {course.location}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}


            {/* 快速操作 */}
            <View className="gap-3">
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/schedule")}
                className="bg-primary rounded-lg py-4 items-center justify-center active:opacity-80"
              >
                <Text className="text-white font-semibold text-base">查看课表</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleLogout}
                className="bg-error/10 border border-error rounded-lg py-4 items-center justify-center active:opacity-80"
              >
                <Text className="text-error font-semibold text-base">退出登录</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // 未登录状态 - 显示登录表单
  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center gap-6 p-6">
          {/* 标题 */}
          <View className="items-center gap-2 mb-4">
            <Text className="text-4xl font-bold text-foreground">ZJU 课表</Text>
            <Text className="text-base text-muted">浙江大学课表助手</Text>
          </View>

          {/* 登录表单 */}
          <View className="gap-4">
            {/* 学号输入框 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">学号</Text>
              <TextInput
                placeholder="请输入您的学号"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                editable={!loading}
                className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              />
            </View>

            {/* 密码输入框 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">密码</Text>
              <TextInput
                placeholder="请输入您的密码"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              />
            </View>

            {/* 错误提示 */}
            {error && (
              <View className="bg-error/10 border border-error rounded-lg p-3">
                <Text className="text-error text-sm">{error}</Text>
              </View>
            )}

            {/* 登录按钮 */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className="bg-primary rounded-lg py-4 items-center justify-center active:opacity-80 disabled:opacity-50"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">登录</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 提示文字 */}
          <View className="items-center gap-2 mt-4">
            <Text className="text-xs text-muted text-center">
              使用浙江大学统一身份认证登录
            </Text>
            <Text className="text-xs text-muted text-center">
              登录后可查看您的课程安排
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
