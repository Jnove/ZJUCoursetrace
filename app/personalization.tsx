/**
 * app/personalization.tsx
 *
 * Three customisation panels:
 *   1. Accent colour  — 15 presets, live preview
 *   2. Card radius    — sm / medium / lg
 *   3. Course palette — 5 colour schemes for timetable blocks, with full swatch preview
 *
 * Every change applies immediately (no separate Save button).
 */

import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  useTheme, CARD_RADIUS_VALUES, DEFAULT_PRIMARY,
} from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import { COURSE_PALETTES, PALETTE_ORDER, PaletteKey } from "@/lib/course-palette";

// ─── Accent colour palette ────────────────────────────────────────────────────

const ACCENT_COLORS = [
  { name: "海洋蓝", value: "#0a7ea4" },
  { name: "极光蓝", value: "#3b82f6" },
  { name: "天青",   value: "#06b6d4" },
  { name: "薄荷绿", value: "#10b981" },
  { name: "翠绿",   value: "#22c55e" },
  { name: "橄榄",   value: "#84cc16" },
  { name: "琥珀",   value: "#f59e0b" },
  { name: "橙焰",   value: "#f97316" },
  { name: "珊瑚红", value: "#ef4444" },
  { name: "玫瑰",   value: "#f43f5e" },
  { name: "紫藤",   value: "#a855f7" },
  { name: "靛蓝",   value: "#6366f1" },
  { name: "品红",   value: "#ec4899" },
  { name: "钢青",   value: "#0891b2" },
  { name: "石板灰", value: "#64748b" },
];

const RADII: { label: string; sub: string; value: "small" | "medium" | "large" }[] = [
  { label: "紧凑", sub: "8 px",  value: "small" },
  { label: "标准", sub: "14 px", value: "medium" },
  { label: "圆润", sub: "22 px", value: "large" },
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function hexToRgba(hex: string, a: number) {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text style={{
      fontSize: 11, fontWeight: "600", color: colors.muted,
      letterSpacing: 0.6, textTransform: "uppercase",
      paddingHorizontal: 2,
    }}>
      {children}
    </Text>
  );
}

// ─── Live preview card ────────────────────────────────────────────────────────
function Preview({
  accentColor, radius, coursePaletteKey,
}: {
  accentColor: string; radius: number; coursePaletteKey: PaletteKey;
}) {
  const colors    = useColors();
  const palette   = COURSE_PALETTES[coursePaletteKey].colors;
  const cardR     = Math.max(radius - 2, 6);

  const MOCK = [
    { name: "高等数学", period: "1–2", room: "东4-101"  },
    { name: "大学物理", period: "3–4", room: "东1-208"  },
    { name: "线性代数", period: "6–7", room: "西2-306"  },
    { name: "英语写作", period: "9–10",room: "曹楼105"  },
    { name: "程序设计", period: "11–12",room:"紫金港C321" },
  ];

  return (
    <View style={{
      borderRadius: radius + 4, overflow: "hidden",
      borderWidth: 0.5, borderColor: colors.border,
      backgroundColor: colors.surface,
      shadowColor: accentColor, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
    }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.background,
        paddingHorizontal: 14, paddingVertical: 11,
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
        flexDirection: "row", alignItems: "center", gap: 10,
      }}>
        <View style={{
          width: 34, height: 34, borderRadius: cardR,
          backgroundColor: accentColor,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Z</Text>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ width: 72, height: 9, borderRadius: 4, backgroundColor: colors.foreground, opacity: 0.75 }} />
          <View style={{ width: 108, height: 7, borderRadius: 3, backgroundColor: colors.muted, opacity: 0.4 }} />
        </View>
        <View style={{
          paddingHorizontal: 9, paddingVertical: 4, borderRadius: cardR,
          backgroundColor: hexToRgba(accentColor, 0.13),
        }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: accentColor }}>周一</Text>
        </View>
      </View>

      {/* Course blocks */}
      <View style={{ padding: 12, gap: 8 }}>
        {MOCK.map((c, i) => {
          const blockColor = palette[i % palette.length];
          return (
            <View key={i} style={{
              borderRadius: cardR, backgroundColor: colors.background,
              overflow: "hidden",
              shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
            }}>
              <View style={{ height: 3, backgroundColor: blockColor }} />
              <View style={{
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 11, paddingVertical: 8, gap: 8,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}
                    numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    第{c.period}节  {c.room}
                  </Text>
                </View>
                <View style={{
                  width: 6, height: 24, borderRadius: 3,
                  backgroundColor: blockColor, opacity: 0.6,
                }} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Tab bar */}
      <View style={{
        flexDirection: "row", backgroundColor: colors.background,
        borderTopWidth: 0.5, borderTopColor: colors.border,
        paddingVertical: 10,
      }}>
        {(["house.fill", "paperplane.fill", "graduationcap.fill", "gearshape.2.fill"] as const).map((icon, i) => (
          <View key={icon} style={{ flex: 1, alignItems: "center", gap: 3 }}>
            <IconSymbol name={icon} size={19} color={i === 0 ? accentColor : colors.muted} />
            <View style={{
              width: i === 0 ? 20 : 0, height: 2.5, borderRadius: 1.5,
              backgroundColor: accentColor,
            }} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Course palette card ──────────────────────────────────────────────────────
function PaletteCard({
  paletteKey, isActive, onPress,
}: {
  paletteKey: PaletteKey; isActive: boolean; onPress: () => void;
}) {
  const colors  = useColors();
  const palette = COURSE_PALETTES[paletteKey];
  const { primaryColor } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      style={{
        flexDirection: "row", alignItems: "center", gap: 14,
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: isActive ? hexToRgba(primaryColor, 0.06) : "transparent",
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
      }}
    >
      {/* Swatch strip */}
      <View style={{ flexDirection: "row", gap: 4 }}>
        {palette.preview.map((clr, i) => (
          <View key={i} style={{
            width: 20, height: 20, borderRadius: 5,
            backgroundColor: clr,
            shadowColor: clr,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.35, shadowRadius: 2, elevation: 1,
          }} />
        ))}
      </View>

      {/* Name + description */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{
          fontSize: 15, fontWeight: isActive ? "600" : "400",
          color: isActive ? primaryColor : colors.foreground,
        }}>
          {palette.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{palette.desc}</Text>
      </View>

      {/* Check */}
      {isActive ? (
        <View style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: primaryColor,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700" }}>✓</Text>
        </View>
      ) : (
        <View style={{
          width: 22, height: 22, borderRadius: 11,
          borderWidth: 1.5, borderColor: colors.border,
        }} />
      )}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PersonalizationScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const {
    primaryColor, setPrimaryColor,
    cardRadius,   setCardRadius,
    coursePaletteKey, setCoursePaletteKey,
  } = useTheme();

  // Local preview mirrors live (changes apply immediately)
  const [previewAccent,  setPreviewAccent]  = useState(primaryColor);
  const [previewRadius,  setPreviewRadius]  = useState(cardRadius);
  const [previewPalette, setPreviewPalette] = useState(coursePaletteKey);

  const isDefault =
    previewAccent  === DEFAULT_PRIMARY &&
    previewRadius  === "medium" &&
    previewPalette === "classic";

  const handleReset = async () => {
    setPreviewAccent("classic" as any);  // will be overwritten below
    setPreviewAccent(DEFAULT_PRIMARY);
    setPreviewRadius("medium");
    setPreviewPalette("classic");
    await setPrimaryColor(null);
    await setCardRadius("medium");
    await setCoursePaletteKey("classic");
  };

  const handleAccentPress = async (value: string) => {
    setPreviewAccent(value);
    await setPrimaryColor(value === DEFAULT_PRIMARY ? null : value);
  };

  const handleRadiusPress = async (value: "small" | "medium" | "large") => {
    setPreviewRadius(value);
    await setCardRadius(value);
  };

  const handlePalettePress = async (key: PaletteKey) => {
    setPreviewPalette(key);
    await setCoursePaletteKey(key);
  };

  const rv = CARD_RADIUS_VALUES[previewRadius];

  return (
    <ScreenContainer className="flex-1 bg-surface">
      {/* Nav */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <IconSymbol name="chevron.left" size={22} color={previewAccent} />
        </TouchableOpacity>
        <Text style={{
          flex: 1, textAlign: "center",
          fontSize: 17, fontWeight: "600", color: colors.foreground,
        }}>
          个性化
        </Text>
        <TouchableOpacity
          onPress={handleReset}
          disabled={isDefault}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ opacity: isDefault ? 0.3 : 1 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: previewAccent }}>重置</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 52 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Preview ─────────────────────────────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <SectionLabel>预览</SectionLabel>
          <Preview
            accentColor={previewAccent}
            radius={rv}
            coursePaletteKey={previewPalette}
          />
        </View>

        {/* ── Accent colour ────────────────────────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <SectionLabel>界面主题色</SectionLabel>
          <View style={{
            backgroundColor: colors.background, borderRadius: rv,
            borderWidth: 0.5, borderColor: colors.border,
            padding: 18, gap: 16,
          }}>
            {/* Selected swatch display */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: previewAccent,
                shadowColor: previewAccent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.45, shadowRadius: 10, elevation: 5,
              }} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>
                  {ACCENT_COLORS.find(c => c.value === previewAccent)?.name ?? "自定义"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {previewAccent.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Colour grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {ACCENT_COLORS.map(c => {
                const sel = previewAccent === c.value;
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => handleAccentPress(c.value)}
                    style={({ pressed }) => ({ alignItems: "center", gap: 5, opacity: pressed ? 0.7 : 1 })}
                  >
                    <View style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: c.value,
                      alignItems: "center", justifyContent: "center",
                      borderWidth:  sel ? 2.5 : 0,
                      borderColor:  sel ? colors.foreground : "transparent",
                      shadowColor:  c.value,
                      shadowOffset: { width: 0, height: sel ? 4 : 2 },
                      shadowOpacity: sel ? 0.5 : 0.25,
                      shadowRadius:  sel ? 8 : 3,
                      elevation:     sel ? 5 : 1,
                    }}>
                      {sel && (
                        <View style={{
                          width: 10, height: 10, borderRadius: 5,
                          backgroundColor: "#fff",
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.25, shadowRadius: 2, elevation: 2,
                        }} />
                      )}
                    </View>
                    <Text
                      style={{ fontSize: 9, color: sel ? colors.foreground : colors.muted, width: 44, textAlign: "center" }}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Card corner radius ───────────────────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <SectionLabel>圆角样式</SectionLabel>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {RADII.map(opt => {
              const active = previewRadius === opt.value;
              const optRv  = CARD_RADIUS_VALUES[opt.value];
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => handleRadiusPress(opt.value)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1, alignItems: "center", gap: 12,
                    paddingVertical: 18,
                    borderRadius: optRv,
                    backgroundColor: active ? hexToRgba(previewAccent, 0.1) : colors.background,
                    borderWidth: active ? 1.5 : 0.5,
                    borderColor: active ? previewAccent : colors.border,
                    shadowColor: active ? previewAccent : "#000",
                    shadowOffset: { width: 0, height: active ? 3 : 1 },
                    shadowOpacity: active ? 0.2 : 0.05,
                    shadowRadius: active ? 6 : 3,
                    elevation: active ? 3 : 1,
                  }}
                >
                  <View style={{
                    width: 40, height: 28, borderRadius: optRv,
                    backgroundColor: active ? previewAccent : colors.muted,
                    opacity: active ? 0.8 : 0.3,
                  }} />
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={{
                      fontSize: 14, fontWeight: active ? "600" : "400",
                      color: active ? previewAccent : colors.foreground,
                    }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Course palette ───────────────────────────────────────────────── */}
        <View style={{ gap: 9 }}>
          <SectionLabel>课程色彩方案</SectionLabel>
          <View style={{
            backgroundColor: colors.background, borderRadius: rv,
            borderWidth: 0.5, borderColor: colors.border,
            overflow: "hidden",
            shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            {PALETTE_ORDER.map((key, i) => (
              <PaletteCard
                key={key}
                paletteKey={key}
                isActive={previewPalette === key}
                onPress={() => handlePalettePress(key)}
              />
            ))}
            {/* Remove last card's bottom border */}
          </View>

          {/* Full swatch preview for selected palette */}
          <View style={{
            backgroundColor: colors.background, borderRadius: rv,
            borderWidth: 0.5, borderColor: colors.border,
            padding: 16, gap: 10,
          }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {COURSE_PALETTES[previewPalette].name}的完整配色
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {COURSE_PALETTES[previewPalette].colors.map((clr, i) => (
                <View key={i} style={{
                  width: 26, height: 26, borderRadius: 6,
                  backgroundColor: clr,
                  shadowColor: clr,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.3, shadowRadius: 2, elevation: 1,
                }} />
              ))}
            </View>
          </View>
        </View>

        {/* ── Tip ─────────────────────────────────────────────────────────── */}
        <View style={{
          flexDirection: "row", alignItems: "flex-start", gap: 10,
          backgroundColor: hexToRgba(previewAccent, 0.07),
          borderRadius: rv, padding: 14,
        }}>
          <View style={{
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: hexToRgba(previewAccent, 0.2),
            alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 1,
          }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: previewAccent }}>i</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            所有更改实时生效并自动保存。课程色彩方案会在下次切换学期或刷新课表后完整呈现。
          </Text>
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}
