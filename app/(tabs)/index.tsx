import {
  ScrollView, Text, View, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, LayoutAnimation,
  UIManager, Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";
import { useState, useEffect, useCallback, useRef } from "react";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { getCurrentSemester, SemesterInfo } from "@/lib/semester-utils";
import { Course } from "@/lib/schedule-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PasswordInput } from "@/components/password-input";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { setupNotificationChannel, updateCourseNotification, clearCourseNotification } from '@/lib/course-notification';
import { loadActiveSemesters } from "@/lib/semester-loader";

// Android LayoutAnimation 需要手动启用
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Period table ─────────────────────────────────────────────────────────────
const PERIODS = [
  { number: 1,  startTime: "08:00", endTime: "08:45" },
  { number: 2,  startTime: "08:50", endTime: "09:35" },
  { number: 3,  startTime: "10:00", endTime: "10:45" },
  { number: 4,  startTime: "10:50", endTime: "11:35" },
  { number: 5,  startTime: "11:40", endTime: "12:25" },
  { number: 6,  startTime: "13:25", endTime: "14:10" },
  { number: 7,  startTime: "14:15", endTime: "15:00" },
  { number: 8,  startTime: "15:05", endTime: "15:50" },
  { number: 9,  startTime: "16:15", endTime: "17:00" },
  { number: 10, startTime: "17:05", endTime: "17:50" },
  { number: 11, startTime: "18:50", endTime: "19:35" },
  { number: 12, startTime: "19:40", endTime: "20:25" },
  { number: 13, startTime: "20:30", endTime: "21:15" },
];

// ─── Time utils ───────────────────────────────────────────────────────────────
function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 3600 + m * 60;
}

function getCourseSeconds(course: Course): { start: number; end: number } | null {
  if (course.periodTime) {
    const m = course.periodTime.match(/(\d{2}:\d{2})[—\-](\d{2}:\d{2})/);
    if (m) return { start: parseTimeStr(m[1]), end: parseTimeStr(m[2]) };
  }
  const sp = PERIODS.find(p => p.number === course.startPeriod);
  const ep = PERIODS.find(p => p.number === course.endPeriod);
  if (sp && ep) return { start: parseTimeStr(sp.startTime), end: parseTimeStr(ep.endTime) };
  return null;
}

function getNowSeconds(): number {
  const n = new Date();
  return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
}

function formatCountdown(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function filterCourses(
  allCourses: Course[], dayOfWeek: number, week: number, isOddWeek: boolean
): Course[] {
  return allCourses
    .filter(c => {
      if (c.dayOfWeek !== dayOfWeek) return false;
      if (week < c.weekStart || week > c.weekEnd) return false;
      if (c.isSingleWeek === "single") return isOddWeek;
      if (c.isSingleWeek === "double") return !isOddWeek;
      return true;
    })
    .sort((a, b) => a.startPeriod - b.startPeriod);
}

// ─── Weather types ────────────────────────────────────────────────────────────
type HourlyWeather = {
  time: string;      // "HH:00"
  temp: number;
  icon: string;
  desc: string;
  windSpeed: number;
  humidity: number;
};

type WeatherData = {
  label: string;
  desc: string;
  icon: string;
  tempMax: number;
  tempMin: number;
  rainProb: number;
  isTomorrow: boolean;
  windSpeed: number;   // km/h
  humidity: number;    // %
  hourly: HourlyWeather[];
};

function weatherCodeToDesc(code: number): { desc: string; icon: string } {
  if (code === 0)                       return { desc: "晴",     icon: "sun.max.fill" };
  if (code === 1)                       return { desc: "晴间多云", icon: "cloud.sun.fill" };
  if (code === 2)                       return { desc: "多云",   icon: "cloud.sun.fill" };
  if (code === 3)                       return { desc: "阴",     icon: "cloud.fill" };
  if ([45, 48].includes(code))          return { desc: "雾",     icon: "cloud.fog.fill" };
  if ([51, 53, 55].includes(code))      return { desc: "毛毛雨", icon: "cloud.drizzle.fill" };
  if ([61, 63, 65].includes(code))      return { desc: "雨",     icon: "cloud.rain.fill" };
  if ([71, 73, 75, 77].includes(code))  return { desc: "雪",     icon: "cloud.snow.fill" };
  if ([80, 81, 82].includes(code))      return { desc: "阵雨",   icon: "cloud.rain.fill" };
  if ([95, 96, 99].includes(code))      return { desc: "雷暴",   icon: "cloud.bolt.fill" };
  return { desc: "未知", icon: "cloud.fill" };
}

function getWeatherTip(data: WeatherData): string | null {
  const prefix = data.isTomorrow ? "明天" : "今天";
  if (data.desc.includes("雷"))   return `${prefix}有雷暴，尽量减少外出`;
  if (data.rainProb >= 60)        return `${prefix}降雨概率较高，记得带伞 ☂`;
  if (data.rainProb >= 30)        return `${prefix}可能有雨，建议备伞`;
  if (data.desc.includes("雪"))   return "注意防滑，小心路面结冰";
  if (data.desc.includes("雾"))   return "能见度低，骑行注意安全";
  if (data.tempMax >= 35)         return `高温预警（${data.tempMax}°），注意防暑补水`;
  if (data.tempMin <= 3)          return `气温较低（最低${data.tempMin}°），注意保暖`;
  return null;
}

// ─── Location: 优先使用高德地图，降级到 expo-location 
type SimpleCoords = { latitude: number; longitude: number };

/**
 * 尝试使用 expo-gaode-map 的定位服务（精度更高，适合中国大陆）。
 * 若未安装或未配置 API Key，自动降级到 expo-location + IP 定位。
 */
async function getLocationViaGaode(): Promise<SimpleCoords | null> {
  try {
    // 动态引入，避免未安装时崩溃
    // @ts-ignore
    const gaode = require('expo-gaode-map');
    const AMapLocation = gaode.AMapLocation ?? gaode.Location ?? gaode.default?.Location;
    if (!AMapLocation) return null;

    // 请求系统定位权限
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // 高德单次定位
    const pos = await AMapLocation.getCurrentPosition({
      accuracy: 'high',
      timeout: 10000,
      onceLocation: true,
    });

    const lat = pos?.latitude ?? pos?.coords?.latitude;
    const lng = pos?.longitude ?? pos?.coords?.longitude;
    if (lat && lng) {
      console.log('[Location] 高德定位成功:', lat, lng, pos?.city ?? '');
      return { latitude: lat, longitude: lng };
    }
    return null;
  } catch {
    // expo-gaode-map 未安装或未配置，静默降级
    return null;
  }
}

const getLocationViaWatch = (): Promise<Location.LocationObject> => {
  return new Promise((resolve, reject) => {
    let sub: Location.LocationSubscription | undefined;
    const timer = setTimeout(() => { sub?.remove(); reject(new Error('定位超时')); }, 15000);
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Low },
      (loc) => { clearTimeout(timer); sub?.remove(); resolve(loc); }
    ).then(s => { sub = s; });
  });
};

export const getLocation = async (): Promise<SimpleCoords | null> => {
  // 1. 优先高德定位（中国大陆更精准）
  const gaodePos = await getLocationViaGaode();
  if (gaodePos) return gaodePos;

  // 2. Web 平台直接用浏览器 API
  if (Platform.OS === 'web') {
    const loc = await Location.getCurrentPositionAsync();
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  }

  // 3. expo-location 缓存定位
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 60 * 24, requiredAccuracy: 5000 });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
  } catch { /* ignore */ }

  // 4. IP 定位兜底
  try {
    const ipRes = await fetch('https://httpbin.org/ip');
    const { origin } = await ipRes.json();
    const res = await fetch(`https://api.iping.cc/v1/query?ip=${origin}&language=zh`);
    const json = await res.json();
    const data = json.data;
    if (data?.latitude && data?.longitude) {
      console.log('[Location] IP 定位:', data.city);
      return { latitude: parseFloat(data.latitude), longitude: parseFloat(data.longitude) };
    }
  } catch { /* ignore */ }

  // 5. 最终降级：watch 定位
  const loc = await getLocationViaWatch();
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
};

// ─── Weather fetch (含风速/湿度/逐小时) ──────────────────────────────────────
const fetchWeather = async (): Promise<WeatherData | undefined> => {
  const location = await getLocation();
  if (!location) { console.log('[Weather] 无法获取位置，跳过天气'); return; }
  const { latitude, longitude } = location;
  console.log('[Weather] 定位成功:', latitude, longitude);

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_max` +
    `&hourly=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&timezone=auto&forecast_days=2`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  const daily = json.daily;
  const hourly = json.hourly;

  const hour = new Date().getHours();
  const idx = hour >= 21 ? 1 : 0;
  const { desc, icon } = weatherCodeToDesc(daily.weather_code[idx]);

  // 构建逐小时数据（从当前时刻起的 24 小时）
  const nowHourIndex = hourly.time.findIndex((t: string) => {
    const h = new Date(t).getHours();
    return new Date(t).toDateString() === new Date().toDateString() && h >= hour;
  });
  const startIdx = nowHourIndex >= 0 ? nowHourIndex : hour;

  const hourlyData: HourlyWeather[] = [];
  for (let i = startIdx; i < startIdx + 24 && i < hourly.time.length; i++) {
    const t = hourly.time[i];
    const hh = new Date(t).getHours();
    const { desc: hDesc, icon: hIcon } = weatherCodeToDesc(hourly.weather_code[i]);
    hourlyData.push({
      time: `${String(hh).padStart(2, '0')}:00`,
      temp: Math.round(hourly.temperature_2m[i]),
      icon: hIcon,
      desc: hDesc,
      windSpeed: Math.round(hourly.wind_speed_10m[i]),
      humidity: Math.round(hourly.relative_humidity_2m[i]),
    });
  }

  return {
    label: idx === 1 ? "明天" : "今天",
    desc, icon,
    tempMax: Math.round(daily.temperature_2m_max[idx]),
    tempMin: Math.round(daily.temperature_2m_min[idx]),
    rainProb: Math.round(daily.precipitation_probability_max[idx]),
    isTomorrow: idx === 1,
    windSpeed: Math.round(daily.wind_speed_10m_max?.[idx] ?? 0),
    humidity: Math.round(daily.relative_humidity_2m_max?.[idx] ?? 0),
    hourly: hourlyData,
  };
};

// ─── Period badge ─────────────────────────────────────────────────────────────
function PeriodBadge({ course }: { course: Course }) {
  const colors = useColors();
  const label = course.startPeriod === course.endPeriod
    ? `节 ${course.startPeriod}`
    : `节 ${course.startPeriod}–${course.endPeriod}`;
  return (
    <View style={{
      backgroundColor: colors.surface,
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: 5,
      borderWidth: 0.5, borderColor: colors.border,
    }}>
      <Text style={{ fontSize: 10, fontWeight: "500", color: colors.muted }}>{label}</Text>
    </View>
  );
}

// ─── Weather card (可展开) ────────────────────────────────────────────────────
function WeatherCard({ data, radius }: { data: WeatherData; radius: number }) {
  const colors = useColors();
  const { primaryColor } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const tip = getWeatherTip(data);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleToggle}
      style={{
        borderRadius: radius,
        backgroundColor: colors.background,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
      }}
    >
      {/* ── 基础行 ── */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 12, gap: 12,
      }}>
        <IconSymbol
          name={data.icon as any}
          size={32}
          color={data.isTomorrow ? colors.muted : primaryColor}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
              {data.label}天气
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{data.desc}</Text>
            {data.rainProb > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <IconSymbol name="drop.fill" size={10} color={colors.muted} />
                <Text style={{ fontSize: 11, color: colors.muted }}>{data.rainProb}%</Text>
              </View>
            )}
          </View>
          {tip && (
            <Text style={{ fontSize: 12, color: primaryColor }}>{tip}</Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "500", color: colors.foreground }}>
            {data.tempMax}°
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{data.tempMin}° 最低</Text>
        </View>
        {/* 展开指示箭头 */}
        <IconSymbol
          name={expanded ? "chevron.left" : "chevron.right"}
          size={14}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '-90deg' }] }}
        />
      </View>

      {/* ── 展开详情 ── */}
      {expanded && (
        <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border }}>

          {/* 风速 / 湿度 */}
          <View style={{
            flexDirection: "row",
            paddingHorizontal: 16, paddingVertical: 12,
            gap: 0,
            borderBottomWidth: 0.5, borderBottomColor: colors.border,
          }}>
            <WeatherStat
              icon="cloud.rain.fill"
              label="降水概率"
              value={`${data.rainProb}%`}
              color={primaryColor}
            />
            <WeatherStat
              icon="drop.fill"
              label="湿度"
              value={`${data.humidity}%`}
              color="#06b6d4"
            />
            <WeatherStat
              icon="cloud.fog.fill"
              label="风速"
              value={`${data.windSpeed} km/h`}
              color="#64748b"
            />
          </View>

          {/* 逐小时预报 */}
          {data.hourly.length > 0 && (
            <View style={{ paddingVertical: 12 }}>
              <Text style={{
                fontSize: 11, fontWeight: "600", color: colors.muted,
                letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8,
              }}>
                未来 24 小时
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 4, flexDirection: 'row' }}
              >
                {data.hourly.map((h, i) => (
                  <HourlyItem key={i} item={h} primaryColor={primaryColor} colors={colors} radius={radius} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function WeatherStat({
  icon, label, value, color,
}: {
  icon: string; label: string; value: string; color: string;
}) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <IconSymbol name={icon as any} size={18} color={color} />
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.foreground }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text>
    </View>
  );
}

function HourlyItem({
  item, primaryColor, colors, radius,
}: {
  item: HourlyWeather; primaryColor: string; colors: any; radius: number;
}) {
  return (
    <View style={{
      width: 58,
      alignItems: 'center', gap: 5,
      paddingVertical: 10, paddingHorizontal: 4,
      backgroundColor: colors.surface,
      borderRadius: Math.max(radius - 4, 6),
      marginHorizontal: 3,
    }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontVariant: ['tabular-nums'] }}>
        {item.time}
      </Text>
      <IconSymbol name={item.icon as any} size={18} color={primaryColor} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>
        {item.temp}°
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <IconSymbol name="drop.fill" size={8} color="#06b6d4" />
        <Text style={{ fontSize: 9, color: colors.muted }}>{item.humidity}%</Text>
      </View>
    </View>
  );
}

// ─── Ongoing card ─────────────────────────────────────────────────────────────
function OngoingCard({ course, countdown, nowSec, radius }: {
  course: Course; countdown: number; nowSec: number; radius: number;
}) {
  const colors = useColors();
  const t = getCourseSeconds(course);
  const progress = t
    ? Math.min(1, Math.max(0, (nowSec - t.start) / (t.end - t.start)))
    : 0;

  return (
    <View style={{
      borderRadius: radius, backgroundColor: colors.background, overflow: "hidden",
      shadowColor: course.color,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22, shadowRadius: 12, elevation: 5,
    }}>
      <View style={{ height: 3, backgroundColor: course.color }} />
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 14, paddingTop: 11, gap: 10,
      }}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: course.color }} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: course.color }}>上课中</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground, lineHeight: 20 }} numberOfLines={2}>
            {course.name}
          </Text>
          <View style={{ gap: 3, marginTop: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="clock.fill" size={12} color={course.color} />
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
                {course.periodTime ?? ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="location.fill" size={12} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
                {course.classroom}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <Text style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.3 }}>距下课</Text>
          <Text style={{
            fontSize: 24, fontWeight: "500", color: course.color,
            fontVariant: ["tabular-nums"], lineHeight: 26,
          }}>
            {formatCountdown(countdown)}
          </Text>
        </View>
      </View>
      <View style={{ height: 3, backgroundColor: hexToRgba(course.color, 0.18), marginTop: 11 }}>
        <View style={{
          height: "100%",
          width: `${progress * 100}%` as any,
          backgroundColor: course.color,
        }} />
      </View>
    </View>
  );
}

// ─── Next card ────────────────────────────────────────────────────────────────
function NextCard({ course, countdown, radius }: { course: Course; countdown: number; radius: number; }) {
  const colors = useColors();
  return (
    <View style={{
      borderRadius: radius, backgroundColor: colors.background, overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    }}>
      <View style={{ height: 3, backgroundColor: course.color }} />
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 14, paddingVertical: 11, gap: 10,
      }}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: course.color, opacity: 0.75 }} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: colors.muted }}>即将上课</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground, lineHeight: 20 }} numberOfLines={2}>
            {course.name}
          </Text>
          <View style={{ gap: 3, marginTop: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="clock.fill" size={12} color={course.color} />
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
                {course.periodTime ?? ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="location.fill" size={12} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
                {course.classroom}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <Text style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.3 }}>距上课</Text>
          <Text style={{
            fontSize: 22, fontWeight: "500", color: colors.foreground,
            fontVariant: ["tabular-nums"], lineHeight: 24,
          }}>
            {formatCountdown(countdown)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Plain course card ────────────────────────────────────────────────────────
function CourseCard({ course, radius }: { course: Course; radius: number }) {
  const colors = useColors();
  return (
    <View style={{
      borderRadius: radius, backgroundColor: colors.background, overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
    }}>
      <View style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: 4, backgroundColor: course.color,
      }} />
      <View style={{ paddingLeft: 17, paddingRight: 13, paddingVertical: 11, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={{
            flex: 1, fontSize: 14, fontWeight: "500",
            color: colors.foreground, lineHeight: 18,
          }} numberOfLines={2}>
            {course.name}
          </Text>
          <PeriodBadge course={course} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconSymbol name="clock.fill" size={11} color={course.color} />
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.foreground }}>
              {course.periodTime ?? ""}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
            <IconSymbol name="location.fill" size={11} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
              {course.classroom}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
const POEM_COOLDOWN_MS = 5000; // 5 秒冷却

export default function HomeScreen() {
  const { primaryColor } = useTheme();
  const { state: authState, signIn } = useAuth();
  const { state: scheduleState } = useSchedule();
  const router = useRouter();
  const colors = useColors();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [todaysCourses, setTodaysCourses] = useState<Course[]>([]);
  const [tomorrowCourses, setTomorrowCourses] = useState<Course[]>([]);
  const [semesterInfo, setSemesterInfo] = useState<SemesterInfo | null>(null);
  const [nowSeconds, setNowSeconds] = useState(getNowSeconds);

  // ── 诗词：支持刷新 + 5 秒冷却 ──────────────────────────────────────────────
  const [poem, setPoem] = useState<{ content: string; origin: string; author: string } | null>(null);
  const [poemLoading, setPoemLoading] = useState(false);
  const [poemCooldown, setPoemCooldown] = useState(0); // 剩余冷却秒数
  const poemCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
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

  // ── 诗词获取 ─────────────────────────────────────────────────────────────────
  const fetchPoem = useCallback(async () => {
    if (poemLoading || poemCooldown > 0) return;
    setPoemLoading(true);
    try {
      const res = await fetch("https://v1.jinrishici.com/all.json");
      const d = await res.json();
      setPoem({ content: d.content, origin: d.origin, author: d.author });
      // 启动冷却倒计时
      setPoemCooldown(POEM_COOLDOWN_MS / 1000);
      poemCooldownRef.current = setInterval(() => {
        setPoemCooldown(prev => {
          if (prev <= 1) {
            clearInterval(poemCooldownRef.current!);
            poemCooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch { /* 静默失败 */ } finally {
      setPoemLoading(false);
    }
  }, [poemLoading, poemCooldown]);

  // 首次加载诗词
  useEffect(() => {
    fetch("https://v1.jinrishici.com/all.json")
      .then(r => r.json())
      .then(d => setPoem({ content: d.content, origin: d.origin, author: d.author }))
      .catch(() => {});
    return () => {
      if (poemCooldownRef.current) clearInterval(poemCooldownRef.current);
    };
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
      if (!info) { setTodaysCourses([]); return true; }

      const uname   = await AsyncStorage.getItem("username");
      const cacheKey = await resolveCacheKey(info.schoolYear, info.semester, uname);
      console.log("今日课程尝试读取课程缓存，key =", cacheKey);
      const raw      = await AsyncStorage.getItem(cacheKey);

      if (!raw) return false;

      const all: Course[] = JSON.parse(raw);
      const todayDow = now.getDay() === 0 ? 7 : now.getDay();
      setTodaysCourses(filterCourses(all, todayDow, info.week, info.week % 2 === 1));

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tInfo = getCurrentSemester(tomorrow);
      if (tInfo) {
        const tCacheKey = await resolveCacheKey(tInfo.schoolYear, tInfo.semester, uname);
        const tRaw      = await AsyncStorage.getItem(tCacheKey) ?? raw;
        const tAll: Course[] = JSON.parse(tRaw);
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
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}>
                欢迎回来
              </Text>
              <Text style={{ fontSize: 15, color: colors.muted }}>{authState.username}</Text>
              {semesterInfo && (
                <Text style={{ fontSize: 13, color: primaryColor, fontWeight: "600" }}>
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
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22, letterSpacing: 0.3 }}>
                  {poem.content}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    —— {poem.author}《{poem.origin}》
                  </Text>
                  {/* 刷新指示 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {poemLoading ? (
                      <ActivityIndicator size="small" color={colors.muted} />
                    ) : poemCooldown > 0 ? (
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {poemCooldown}s 后可换一句
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: primaryColor }}>
                        点击换一句
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Weather */}
            {weather && <WeatherCard data={weather} radius={r} />}

            {/* Course section */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
                {showTomorrow ? "明天的课程" : "今天的课程"}
              </Text>

              {showTomorrow ? (
                <View style={{ gap: 8 }}>
                  <View style={{
                    backgroundColor: colors.background, borderRadius: r,
                    borderWidth: 0.5, borderColor: colors.border,
                    paddingHorizontal: 16, paddingVertical: 10, alignItems: "center",
                  }}>
                    <Text style={{ fontSize: 13, color: colors.muted }}>
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
                        <Text style={{ fontSize: 13, color: colors.muted }}>明天也没有课程</Text>
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
                      <Text style={{ fontSize: 13, color: colors.muted }}>今天没有课程</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* View schedule button */}
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/schedule")}
              style={{ backgroundColor:primaryColor, borderRadius:r, paddingVertical:14, alignItems:"center",flexDirection:"row", justifyContent:"center", gap:8 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>查看课表</Text>
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
            <Text style={{ fontSize: 36, fontWeight: "700", color: colors.foreground }}>ZJU 课迹</Text>
            <Text style={{ fontSize: 15, color: colors.muted }}>浙江大学课表助手</Text>
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
                <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>
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
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              使用浙江大学统一身份认证登录
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              登录后可查看您的课程安排
            </Text>
          </View>

        </View>
      </ScrollView>
    </ScreenContainer>
  );
}