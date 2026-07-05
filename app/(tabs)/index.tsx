import {
  ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator,
  UIManager, Platform, AppState, type AppStateStatus,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback, useRef } from "react";
import * as Haptics from "expo-haptics";
import { getCurrentSemester, getNextSemesterStart, SemesterInfo, NextSemesterInfo } from "@/lib/semester-utils";
import { loadCustomCourses, mergeCustomCourses } from "@/lib/custom-courses";
import { Course } from "@/lib/schedule-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PasswordInput } from "@/components/password-input";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import {
  setupNotificationChannel,
  updateCourseNotification,
  clearCourseNotification,
  setAppInBackground,
  saveBgStateAndNotify,
} from '@/lib/course-notification';
import { loadActiveSemesters } from "@/lib/semester-loader";
import { useTheme, CARD_RADIUS_VALUES, FONT_FAMILY_META } from "@/lib/theme-provider";
import { WeatherCard } from "@/components/home/weather-card";
import { OngoingCard, NextCard, CourseCard } from "@/components/home/course-cards";
import { usePoem } from "@/hooks/use-poem";
import { fetchWeather, type WeatherData } from "@/lib/weather";
import {
  getCourseSeconds, getNowSeconds, formatCountdown, hexToRgba, filterCourses,
} from "@/lib/course-time";

// Android LayoutAnimation 需要手动启用（WeatherCard 展开动画依赖）
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen() {
  const { primaryColor } = useTheme();
  const { state: authState, signIn } = useAuth();
  const { state: scheduleState } = useSchedule();
  const router = useRouter();
  const colors = useColors();
  const scheme = useColorScheme();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [todaysCourses, setTodaysCourses] = useState<Course[]>([]);
  const [tomorrowCourses, setTomorrowCourses] = useState<Course[]>([]);
  // 同步初始化，避免学期内首屏闪现假期卡片
  const [semesterInfo, setSemesterInfo] = useState<SemesterInfo | null>(() => getCurrentSemester(new Date()));
  const [nextSem, setNextSem] = useState<NextSemesterInfo | null>(
    () => (getCurrentSemester(new Date()) ? null : getNextSemesterStart(new Date())),
  );
  const [nowSeconds, setNowSeconds] = useState(getNowSeconds);

  const { poem, poemLoading, poemCooldown, fetchPoem } = usePoem();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [, setWeatherError] = useState<string | null>(null);
  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];

  // ── 重试相关 ────────────────────────────────────────────────────────────────
  const MAX_FETCH_ATTEMPTS = 4;
  const RETRY_INTERVAL_MS  = 800;
  const fetchAttemptsRef   = useRef(0);
  const retryTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick every second
  useEffect(() => {
    const t = setInterval(() => setNowSeconds(getNowSeconds()), 1000);
    return () => clearInterval(t);
  }, []);

  // Weather
  useEffect(() => {
    fetchWeather()
      .then(data => { if (data) setWeather(data); })
      .catch(e => setWeatherError(e instanceof Error ? e.message : '天气获取失败'));
  }, []);

  // resolveCacheKey
  const resolveCacheKey = useCallback(async (
    schoolYear: string,
    semester: string,
    username: string | null,
  ): Promise<string> => {
    if (username) {
      const cachedSemesters = await AsyncStorage.getItem(`activeSemesters_${username}`);
      if (cachedSemesters) {
        const allSemesters: { yearValue: string; termValue: string }[] = JSON.parse(cachedSemesters);
        const match = allSemesters.find(
          s => s.yearValue === schoolYear &&
               s.termValue.split("|").pop() === semester,
        );
        if (match) return `schedule_${match.yearValue}_${match.termValue}`;
      }
      const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
      if (lastKey) {
        const parts = lastKey.split("|");
        const lastYear     = parts[0];
        const lastSemester = parts[parts.length - 1];
        if (lastYear === schoolYear && lastSemester === semester) {
          return `schedule_${lastKey}`;
        }
      }
    }
    return `schedule_${schoolYear}_${semester}`;
  }, []);

  const fetchDayCourses = useCallback(async (): Promise<boolean> => {
    try {
      const now  = new Date();
      const info = getCurrentSemester(now);
      setSemesterInfo(info);
      if (!info) {
        // 假期/学期间隙：显示距开学倒计时兜底
        setNextSem(getNextSemesterStart(now));
        setTodaysCourses([]);
        return true;
      }
      setNextSem(null);

      const uname   = await AsyncStorage.getItem("username");
      const custom  = await loadCustomCourses(uname);
      const cacheKey = await resolveCacheKey(info.schoolYear, info.semester, uname);
      console.log("今日课程尝试读取课程缓存，key =", cacheKey);
      const raw      = await AsyncStorage.getItem(cacheKey);

      if (!raw && custom.length === 0) return false;

      const all = mergeCustomCourses<Course>(raw ? JSON.parse(raw) : [], custom);
      const todayDow = now.getDay() === 0 ? 7 : now.getDay();
      setTodaysCourses(filterCourses(all, todayDow, info.week, info.week % 2 === 1));

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tInfo = getCurrentSemester(tomorrow);
      if (tInfo) {
        const tCacheKey = await resolveCacheKey(tInfo.schoolYear, tInfo.semester, uname);
        const tRaw      = (await AsyncStorage.getItem(tCacheKey)) ?? raw;
        const tAll = mergeCustomCourses<Course>(tRaw ? JSON.parse(tRaw) : [], custom);
        const tomorrowDow = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();
        setTomorrowCourses(filterCourses(tAll, tomorrowDow, tInfo.week, tInfo.week % 2 === 1));
      }

      return true;
    } catch (e) {
      console.error("获取课程失败:", e);
      return false;
    }
  }, [resolveCacheKey]);

  useEffect(() => {
    if (!authState.userToken) return;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    fetchAttemptsRef.current = 0;

    const attemptFetch = async () => {
      fetchAttemptsRef.current += 1;
      const found = await fetchDayCourses();
      if (!found && fetchAttemptsRef.current < MAX_FETCH_ATTEMPTS) {
        retryTimerRef.current = setTimeout(attemptFetch, RETRY_INTERVAL_MS);
      }
    };
    attemptFetch();

    return () => {
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, [authState.userToken, scheduleState.courses, fetchDayCourses]);

  useEffect(() => {
    const now = new Date();
    const msToMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const t = setTimeout(() => { fetchAttemptsRef.current = 0; fetchDayCourses(); }, msToMidnight);
    return () => clearTimeout(t);
  }, [fetchDayCourses]);

  // ── Course classification ──────────────────────────────────────────────────
  const ongoingCourse = todaysCourses.find(c => {
    const t = getCourseSeconds(c);
    return t ? nowSeconds >= t.start && nowSeconds < t.end : false;
  });

  const upcomingCourses = todaysCourses.filter(c => {
    const t = getCourseSeconds(c);
    return t ? nowSeconds < t.start : false;
  });

  const nextCourse = ongoingCourse ? null : upcomingCourses[0];
  const laterCourses = ongoingCourse ? upcomingCourses : upcomingCourses.slice(1);
  const showTomorrow = !ongoingCourse && upcomingCourses.length === 0;

  const ongoingCountdown = (() => {
    if (!ongoingCourse) return 0;
    const t = getCourseSeconds(ongoingCourse);
    return t ? Math.max(0, t.end - nowSeconds) : 0;
  })();

  const nextCountdown = (() => {
    if (!nextCourse) return 0;
    const t = getCourseSeconds(nextCourse);
    return t ? Math.max(0, t.start - nowSeconds) : 0;
  })();

  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  useEffect(() => {
    setupNotificationChannel();
    return () => { clearCourseNotification(); };
  }, []);

  useEffect(() => {
    if (!authState.userToken) { clearCourseNotification(); return; }
    updateCourseNotification(
      ongoingCourse ?? null,
      nextCourse ?? null,
      ongoingCourse ? formatCountdown(ongoingCountdown) : formatCountdown(nextCountdown),
    );
  }, [nowSeconds, ongoingCourse, nextCourse]);

  // ── AppState 前台/后台切换（issue #3）────────────────────────────────────────
  // 进入后台：标记 _isBg，立即写入课程截止时间戳并发一次精确通知，
  //           后续由 expo-background-task 粗粒度刷新（约 15 分钟）。
  // 回到前台：恢复每秒实时刷新。
  // 依赖 ongoingCourse/nextCourse，确保闭包内课程数据是最新的。
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;

      if (prev === 'active' && nextAppState !== 'active') {
        setAppInBackground(true);
        if (authState.userToken) {
          saveBgStateAndNotify(ongoingCourse ?? null, nextCourse ?? null, Date.now());
        }
      } else if (prev !== 'active' && nextAppState === 'active') {
        setAppInBackground(false);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [authState.userToken, ongoingCourse, nextCourse]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) { setError("请输入学号和密码"); return; }
    setLoading(true); setError("");
    try {
      await signIn(username, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUsername(""); setPassword("");
      loadActiveSemesters(username).catch(err => console.warn("加载学期列表失败", err));
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : "登录失败，请检查学号和密码");
    } finally {
      setLoading(false);
    }
  };

  // ── Logged-in view ─────────────────────────────────────────────────────────
  if (authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, gap: 20, padding: 24 }}>

            {/* Welcome */}
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: ff }}>
                {"欢迎回来"}
              </Text>
              <Text style={{ fontSize: 15, color: colors.muted, fontFamily: ff }}>{authState.name ? authState.name : authState.username}</Text>
              {semesterInfo && (
                <Text style={{ fontSize: 13, color: primaryColor, fontWeight: "600", fontFamily: ff }}>
                  {semesterInfo.schoolYear} {semesterInfo.semester}学期 第{semesterInfo.week}周
                </Text>
              )}
            </View>

            {/* ── 诗词（点击可刷新，5 秒冷却）─────────────────────────────── */}
            {poem && (
              <TouchableOpacity
                activeOpacity={poemCooldown > 0 ? 1 : 0.75}
                onPress={fetchPoem}
                style={{
                  borderRadius: r,
                  backgroundColor: colors.background,
                  borderLeftWidth: 3, borderLeftColor: colors.primary,
                  paddingHorizontal: 16, paddingVertical: 14, gap: 6,
                  ...cardShadow(scheme, { offsetY: 1, opacity: 0.05, radius: 5, elevation: 1 }),
                }}
              >
                <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22, letterSpacing: 0.3, fontFamily: ff }}>
                  {poem.content}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
                    —— {poem.author}《{poem.origin}》
                  </Text>
                  {/* 刷新指示 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {poemLoading ? (
                      <ActivityIndicator size="small" color={colors.muted} />
                    ) : poemCooldown > 0 ? (
                      <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>
                        {poemCooldown}s 后可换一句
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: primaryColor, fontFamily: ff }}>
                        点击换一句
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Weather */}
            {weather && <WeatherCard data={weather} radius={r} />}

            {/* ── 假期/学期间隙兜底 ── */}
            {!semesterInfo ? (
              <View style={{
                backgroundColor: colors.background, borderRadius: r,
                paddingVertical: 28, paddingHorizontal: 20,
                alignItems: "center", gap: 8,
                ...cardShadow(scheme, { offsetY: 1, opacity: 0.06, radius: 5, elevation: 2 }),
              }}>
                <Text style={{ fontSize: 34 }}>🏖️</Text>
                <Text style={{ fontSize: 17, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
                  假期中
                </Text>
                {nextSem ? (
                  <>
                    <Text style={{ fontSize: 14, color: colors.muted, fontFamily: ff }}>
                      距 {nextSem.semester}学期开学还有
                    </Text>
                    <Text style={{ fontSize: 32, fontWeight: "700", color: primaryColor, fontFamily: ff, fontVariant: ["tabular-nums"] }}>
                      {nextSem.daysUntil} 天
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
                      {nextSem.schoolYear} {nextSem.semester}学期 · {nextSem.startDate.getMonth() + 1}月{nextSem.startDate.getDate()}日
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>
                    好好休息，享受假期
                  </Text>
                )}
              </View>
            ) : (
            <View style={{ gap: 10 }}>
              {/* Course section */}
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
                {showTomorrow ? "明天的课程" : "今天的课程"}
              </Text>

              {showTomorrow ? (
                <View style={{ gap: 8 }}>
                  <View style={{
                    backgroundColor: colors.background, borderRadius: r,
                    borderWidth: 0.5, borderColor: colors.border,
                    paddingHorizontal: 16, paddingVertical: 10, alignItems: "center",
                  }}>
                    <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>
                      {todaysCourses.length > 0 ? "今天的课程已全部结束" : "今天没有课程"}
                    </Text>
                  </View>
                  {tomorrowCourses.length > 0
                    ? tomorrowCourses.map((c, i) => <CourseCard key={i} course={c} radius={r}/>)
                    : (
                      <View style={{
                        backgroundColor: colors.background, borderRadius: r,
                        borderWidth: 0.5, borderColor: colors.border,
                        padding: 16, alignItems: "center",
                      }}>
                        <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>明天也没有课程</Text>
                      </View>
                    )}
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {ongoingCourse && (
                    <OngoingCard
                      course={ongoingCourse}
                      countdown={ongoingCountdown}
                      nowSec={nowSeconds}
                      radius={r}
                    />
                  )}
                  {nextCourse && (
                    <NextCard course={nextCourse} countdown={nextCountdown} radius={r} />
                  )}
                  {laterCourses.map((c, i) => <CourseCard key={i} course={c} radius={r}/>)}
                  {todaysCourses.length === 0 && (
                    <View style={{
                      backgroundColor: colors.background, borderRadius: r,
                      borderWidth: 0.5, borderColor: colors.border,
                      padding: 16, alignItems: "center",
                    }}>
                      <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>今天没有课程</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            )}

            {/* View schedule button */}
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/schedule")}
              style={{ backgroundColor:primaryColor, borderRadius:r, paddingVertical:14, alignItems:"center",flexDirection:"row", justifyContent:"center", gap:8 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15, fontFamily: ff }}>查看课表</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Login view ─────────────────────────────────────────────────────────────
  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ flex: 1, justifyContent: "center", gap: 24, padding: 24 }}>

          <View style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 36, fontWeight: "700", color: colors.foreground, fontFamily: ff }}>ZJU 课迹</Text>
            <Text style={{ fontSize: 15, color: colors.muted, fontFamily: ff }}>浙江大学课表助手</Text>
          </View>

          <View style={{ gap: 14 }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                学号
              </Text>
              <TextInput
                placeholder="请输入您的学号"
                placeholderTextColor={colors.muted}
                value={username}
                onChangeText={setUsername}
                editable={!loading}
                style={{
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                  borderRadius: r, paddingHorizontal: 14, paddingVertical: 12,
                  color: colors.foreground, fontSize: 15,
                }}
              />
            </View>

            <PasswordInput
              placeholder="请输入您的密码"
              value={password}
              onChangeText={setPassword}
              loading={loading}
            />

            {error ? (
              <View style={{
                backgroundColor: hexToRgba(colors.error, 0.1),
                borderWidth: 1, borderColor: colors.error,
                borderRadius: r, padding: 12,
              }}>
                <Text style={{ color: colors.error, fontSize: 13, fontFamily: ff }}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={{
                backgroundColor: primaryColor, borderRadius: r,
                paddingVertical: 14, alignItems: "center",
                opacity: loading ? 0.5 : 1,
              }}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>登录</Text>}
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: "center", gap: 6, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", fontFamily: ff }}>
              使用浙江大学统一身份认证登录
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", fontFamily: ff }}>
              登录后可查看您的课程安排
            </Text>
          </View>

        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
