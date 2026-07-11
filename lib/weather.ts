/**
 * 天气数据：定位（系统定位(无 GMS 可用) → expo-location 缓存 → IP → GPS 兜底）+ Open-Meteo 拉取。
 * 纯数据层，无 UI。
 */

import { Platform } from "react-native";
import * as Location from "expo-location";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HourlyWeather = {
  time: string;      // "HH:00"
  temp: number;
  icon: string;
  desc: string;
  windSpeed: number;
  humidity: number;
};

export type WeatherData = {
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

export function weatherCodeToDesc(code: number): { desc: string; icon: string } {
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

export function getWeatherTip(data: WeatherData): string | null {
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

// ─── Location: 系统定位（无 GMS 也可用）→ expo-location 缓存 → IP → GPS 兜底 ──

type SimpleCoords = { latitude: number; longitude: number };

/**
 * expo-location 在 Android 上依赖 Google Play 服务的 Fused Location Provider，
 * 无 GMS 的设备（国产 ROM 大多数）会报 "Location provider is unavailable"。
 * @react-native-community/geolocation 的 locationProvider: "auto" 有 GMS 时走
 * Play Services，没有时自动落回系统 LocationManager（GPS + 厂商网络定位），
 * 因此作为原生定位的首选。权限仍统一由 expo-location 申请（纯运行时权限，不依赖 GMS）。
 *
 * 必须惰性 require：这是原生模块，Expo Go 里没有链接，顶层 import 会在模块
 * 求值时直接抛错炸掉整个路由。require 失败时返回 null，降级到缓存/IP 链路。
 */
type GeolocationModule = typeof import("@react-native-community/geolocation").default;
let geolocation: GeolocationModule | null | undefined;
function getGeolocation(): GeolocationModule | null {
  if (geolocation !== undefined) return geolocation;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 惰性加载原生模块，Expo Go 下 import 会抛错
    const mod = require("@react-native-community/geolocation");
    const Geolocation: GeolocationModule = mod.default ?? mod;
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      authorizationLevel: "whenInUse",
      locationProvider: "auto",
    });
    geolocation = Geolocation;
  } catch {
    console.log('[Location] geolocation 原生模块不可用（Expo Go？），跳过系统定位');
    geolocation = null;
  }
  return geolocation;
}

function getLocationViaGeolocation(opts: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<SimpleCoords | null> {
  const Geolocation = getGeolocation();
  if (!Geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      Geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => {
          console.log('[Location] 系统定位失败:', err.message);
          resolve(null);
        },
        opts,
      );
    } catch {
      resolve(null);
    }
  });
}

export const getLocation = async (): Promise<SimpleCoords | null> => {
  // 1. Web 平台直接用浏览器 API
  if (Platform.OS === 'web') {
    const loc = await Location.getCurrentPositionAsync();
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  }

  // 2. 申请定位权限；被拒则直接跳到 IP 兜底
  let granted = false;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    granted = status === 'granted';
  } catch { /* ignore */ }

  if (granted) {
    // 3. 系统定位：低精度（网络定位，快），接受 1 小时内的缓存
    const pos = await getLocationViaGeolocation({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 1000 * 60 * 60,
    });
    if (pos) {
      console.log('[Location] 系统定位成功:', pos.latitude, pos.longitude);
      return pos;
    }

    // 4. expo-location 缓存定位（有 GMS 的老设备可能还留有缓存）
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 60 * 24, requiredAccuracy: 5000 });
      if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    } catch { /* ignore */ }
  }

  // 5. IP 定位兜底
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

  // 6. 最终降级：GPS 单次定位（室外可用，室内大概率超时）
  if (granted) {
    const gps = await getLocationViaGeolocation({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
    if (gps) return gps;
  }

  return null;
};

// ─── Weather fetch (含风速/湿度/逐小时) ──────────────────────────────────────

export const fetchWeather = async (): Promise<WeatherData | undefined> => {
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
