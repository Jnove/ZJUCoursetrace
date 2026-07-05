/**
 * 首页天气卡片：基础行 + 可展开的风速/湿度/逐小时曲线图。
 */

import { useState } from "react";
import { LayoutAnimation, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Svg, {
  Path, Circle, Text as SvgText,
  Defs, LinearGradient, Stop, G, Line,
} from 'react-native-svg';

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import { useTheme, FONT_FAMILY_META } from "@/lib/theme-provider";
import { getWeatherTip, type HourlyWeather, type WeatherData } from "@/lib/weather";

export function WeatherCard({ data, radius }: { data: WeatherData; radius: number }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const { primaryColor } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const tip = getWeatherTip(data);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View style={{
        borderRadius: radius,
        backgroundColor: colors.background,
        overflow: "hidden",
        ...cardShadow(scheme, { offsetY: 1, opacity: 0.06, radius: 5, elevation: 2 }),
      }}>
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleToggle}
      style={{
        borderRadius: radius,
        backgroundColor: colors.background,
        overflow: "hidden",
        ...cardShadow(scheme, { offsetY: 1, opacity: 0.06, radius: 5, elevation: 2 }),
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
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
              {data.label}天气
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{data.desc}</Text>
            {data.rainProb > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <IconSymbol name="drop.fill" size={10} color={colors.muted} />
                <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>{data.rainProb}%</Text>
              </View>
            )}
          </View>
          {tip && (
            <Text style={{ fontSize: 12, color: primaryColor, fontFamily: ff }}>{tip}</Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "500", color: colors.foreground, fontFamily: ff }}>
            {data.tempMax}°
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>{data.tempMin}° 最低</Text>
        </View>
        {/* 展开指示箭头 */}
        <IconSymbol
          name={"chevron.left"}
          size={14}
          color={colors.muted}
          style={{ transform: [{ rotate: expanded ? '90deg' : '-90deg' }] }}
        />
      </View>
          </TouchableOpacity>
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

          {/* 逐小时预报：光滑曲线图 */}
          {data.hourly.length > 0 && (
            <View style={{ paddingTop: 12, paddingBottom: 4 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16, marginBottom: 6,
              }}>
                <Text style={{
                  fontSize: 11, fontWeight: "600", color: colors.muted, fontFamily: ff,
                  letterSpacing: 0.5,
                }}>
                  未来 24 小时
                </Text>
                {/* 图例 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 18, height: 2.5, borderRadius: 2, backgroundColor: primaryColor }} />
                    <Text style={{ fontSize: 10, color: colors.muted, fontFamily: ff }}>温度</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 5, height: 10, borderRadius: 3, backgroundColor: '#06b6d4', opacity: 0.75 }} />
                    <Text style={{ fontSize: 10, color: colors.muted, fontFamily: ff }}>湿度</Text>
                  </View>
                </View>
              </View>
              <HourlyChart hourly={data.hourly} primaryColor={primaryColor} colors={colors} />
            </View>
          )}
        </View>
      )}
      </View>

  );
}

function WeatherStat({
  icon, label, value, color,
}: {
  icon: string; label: string; value: string; color: string;
}) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <IconSymbol name={icon as any} size={18} color={color} />
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: ff }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>{label}</Text>
    </View>
  );
}

// ─── Weather icon → emoji map (for SVG text rendering) ───────────────────────
const WEATHER_EMOJI: Record<string, string> = {
  "sun.max.fill":       "☀",
  "cloud.sun.fill":     "⛅",
  "cloud.fill":         "☁",
  "cloud.fog.fill":     "🌫",
  "cloud.drizzle.fill": "🌦",
  "cloud.rain.fill":    "🌧",
  "cloud.snow.fill":    "❄",
  "cloud.bolt.fill":    "⛈",
};

/**
 * Catmull-Rom 样条 → Cubic Bezier 转换，生成经过所有控制点的光滑 SVG 路径。
 * 相邻控制点切线由前后两点决定，自然不振荡。
 */
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(i - 2, 0)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(i + 1, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ─── 逐小时折线图（SVG 光滑曲线 + 湿度柱）──────────────────────────────────
function HourlyChart({
  hourly, primaryColor, colors,
}: {
  hourly: HourlyWeather[];
  primaryColor: string;
  colors: any;
}) {
  if (hourly.length < 2) return null;

  // ── 水平布局 ──────────────────────────────────────────────────────────────
  const STEP  = 54;                               // 每小时列宽
  const PAD_L = 38;                               // 左侧留白（放刻度标签）
  const PAD_R = 18;                               // 右侧留白
  const W     = hourly.length * STEP + PAD_L + PAD_R;

  // ── 纵向分区（从顶到底）───────────────────────────────────────────────────
  //
  //  ┌─ ICON_Y = 15      天气 emoji
  //  ├─ CURVE_TOP = 30   ┐
  //  │                   │ 温度曲线区
  //  ├─ CURVE_BOT = 108  ┘
  //  │  (8px gap)
  //  ├─ HUM_TOP = 116    ← "100%" 参考线（顶）
  //  │                   │ 湿度柱区（44px 高）
  //  ├─ HUM_BASE = 160   ← "0%"  参考线（底）
  //  │  (18px gap)
  //  └─ TIME_Y = 183     时间标签
  //     H = 192

  const H          = 192;
  const ICON_Y     = 15;
  const CURVE_TOP  = 30;
  const CURVE_BOT  = 108;
  const HUM_TOP    = 116;   // 100% 对应的 y
  const HUM_BASE   = 160;   // 0%  对应的 y
  const HUM_ZONE_H = HUM_BASE - HUM_TOP;  // = 44px，满格就是 44px
  const TIME_Y     = 183;
  const CURVE_H    = CURVE_BOT - CURVE_TOP;

  // ── 温度映射 ──────────────────────────────────────────────────────────────
  const temps   = hourly.map(h => h.temp);
  const minTemp = Math.min(...temps) - 1.5;
  const maxTemp = Math.max(...temps) + 1.5;
  const range   = maxTemp - minTemp || 1;

  const getX   = (i: number) => PAD_L + i * STEP + STEP / 2;
  const getTempY = (t: number) => CURVE_BOT - ((t - minTemp) / range) * CURVE_H;
  const getHumY  = (h: number) => HUM_BASE - (h / 100) * HUM_ZONE_H;

  const pts      = hourly.map((h, i) => ({ x: getX(i), y: getTempY(h.temp) }));
  const linePath = buildSmoothPath(pts);
  const fillPath = `${linePath} L ${pts[pts.length-1].x} ${CURVE_BOT} L ${pts[0].x} ${CURVE_BOT} Z`;

  const HUM_COLOR  = '#06b6d4';
  const GUIDE_COL  = colors.muted;   // 刻度文字颜色
  const GUIDE_LINE = '#94a3b8';      // 参考线颜色（比 border 深一些，保证可见）

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4 }}
    >
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="tGrad2" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"   stopColor={primaryColor} stopOpacity="0.26" />
            <Stop offset="0.8" stopColor={primaryColor} stopOpacity="0.04" />
            <Stop offset="1"   stopColor={primaryColor} stopOpacity="0"    />
          </LinearGradient>
          {/* 湿度柱：从顶（不透明）到底（半透明） */}
          <LinearGradient id="hGrad2" x1="0" y1={HUM_TOP} x2="0" y2={HUM_BASE} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={HUM_COLOR} stopOpacity="0.9" />
            <Stop offset="1" stopColor={HUM_COLOR} stopOpacity="0.3" />
          </LinearGradient>
        </Defs>

        {/* ── 湿度区参考线：100% ────────────────────────────────────────── */}
        <Line
          x1={PAD_L - 6} y1={HUM_TOP}
          x2={W - PAD_R} y2={HUM_TOP}
          stroke={GUIDE_LINE} strokeWidth="1"
          strokeDasharray="3 3" opacity="0.9"
        />
        <SvgText
          x={PAD_L - 8} y={HUM_TOP + 4}
          fontSize="9" textAnchor="end" fill={GUIDE_COL} opacity="0.85"
        >100%</SvgText>

        {/* ── 湿度区参考线：50% ──────────────────────────────────────────── */}
        <Line
          x1={PAD_L - 6} y1={(HUM_TOP + HUM_BASE) / 2}
          x2={W - PAD_R} y2={(HUM_TOP + HUM_BASE) / 2}
          stroke={GUIDE_LINE} strokeWidth="0.75"
          strokeDasharray="2 4" opacity="0.5"
        />
        <SvgText
          x={PAD_L - 8} y={(HUM_TOP + HUM_BASE) / 2 + 4}
          fontSize="9" textAnchor="end" fill={GUIDE_COL} opacity="0.6"
        >50%</SvgText>

        {/* ── 湿度区基线：0% ────────────────────────────────────────────── */}
        <Line
          x1={PAD_L - 6} y1={HUM_BASE}
          x2={W - PAD_R} y2={HUM_BASE}
          stroke={GUIDE_LINE} strokeWidth="1.2"
          opacity="0.9"
        />
        <SvgText
          x={PAD_L - 8} y={HUM_BASE + 4}
          fontSize="9" textAnchor="end" fill={GUIDE_COL} opacity="0.85"
        >0%</SvgText>

        {/* ── 温度曲线渐变填充 ──────────────────────────────────────────── */}
        <Path d={fillPath} fill="url(#tGrad2)" />

        {/* ── 每列数据 ─────────────────────────────────────────────────── */}
        {hourly.map((h, i) => {
          const x      = getX(i);
          const tempY  = getTempY(h.temp);
          const humTop = getHumY(h.humidity);        // 柱顶 y（数值越大 y 越小）
          const showLabel = i % 3 === 0;
          const emoji  = WEATHER_EMOJI[h.icon] ?? '·';

          return (
            <G key={i}>
              {/* 天气 emoji（每 3 小时） */}
              {showLabel && (
                <SvgText x={x} y={ICON_Y} fontSize="13" textAnchor="middle" fill={colors.foreground}>
                  {emoji}
                </SvgText>
              )}

              {/* 温度标签（曲线上方） */}
              <SvgText
                x={x} y={tempY - 6}
                fontSize="10.5" fontWeight="700" textAnchor="middle"
                fill={colors.foreground}
              >
                {h.temp}°
              </SvgText>

              {/* 湿度柱：从 HUM_BASE 向上延伸到 humTop */}
              <Path
                d={`M ${x} ${HUM_BASE} L ${x} ${humTop}`}
                stroke="url(#hGrad2)"
                strokeWidth="6"
                strokeLinecap="round"
              />

              {/* 湿度数值（柱顶上方，若列太短就显示在柱内）*/}
              {showLabel && (
                <SvgText
                  x={x}
                  y={humTop - 4}
                  fontSize="9" fontWeight="600" textAnchor="middle"
                  fill={HUM_COLOR} opacity="0.95"
                >
                  {h.humidity}%
                </SvgText>
              )}

              {/* 时间标签（每 3 小时） */}
              {showLabel && (
                <SvgText x={x} y={TIME_Y} fontSize="10" textAnchor="middle" fill={colors.muted}>
                  {h.time}
                </SvgText>
              )}
            </G>
          );
        })}

        {/* ── 温度主曲线（最后画，保证在柱和标签之上） ──────────────────── */}
        <Path
          d={linePath}
          stroke={primaryColor} strokeWidth="2.5"
          fill="none" strokeLinecap="round" strokeLinejoin="round"
        />

        {/* 曲线关键点圆点（每 3 小时） */}
        {hourly.map((h, i) => {
          if (i % 3 !== 0) return null;
          return (
            <Circle key={`dot-${i}`}
              cx={getX(i)} cy={getTempY(h.temp)} r={3.5}
              fill={primaryColor} stroke={colors.background} strokeWidth="1.5"
            />
          );
        })}
      </Svg>
    </ScrollView>
  );
}
