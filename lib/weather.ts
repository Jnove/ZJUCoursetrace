/**
 * 天气数据：定位（高德 → expo-location 缓存 → IP → watch 兜底）+ Open-Meteo 拉取。
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

// ─── Location: 优先使用高德地图，降级到 expo-location ────────────────────────

type SimpleCoords = { latitude: number; longitude: number };

/**
 * 尝试使用 expo-gaode-map 的定位服务（精度更高，适合中国大陆）。
 * 若未安装或未配置 API Key，自动降级到 expo-location + IP 定位。
 *
 * 使用前请在 app.json plugins 配置 expo-gaode-map：
 *   ["expo-gaode-map", { "androidKey": "YOUR_KEY", "iosKey": "YOUR_KEY" }]
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
