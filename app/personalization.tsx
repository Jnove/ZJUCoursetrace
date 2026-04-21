/**
 * Three customisation panels:
 *   1. Accent colour  — 15 presets, live preview
 *   2. Card radius    — small / medium / large
 *   3. Course palette — 5 colour schemes for timetable blocks, with full swatch preview
 */

import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import { COURSE_PALETTES, PALETTE_ORDER, PaletteKey, assignColors } from "@/lib/course-palette";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadActiveSemesters} from "@/lib/semester-loader";
import { RawCourse } from "@/lib/zju-client";
import { useSchedule } from "@/lib/schedule-context";
import { useTheme, CARD_RADIUS_VALUES, DEFAULT_PRIMARY, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";

// Accent colour palette

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

const RADII: { label: string; sub: string; value: "small" | "medium" | "large" | "very_large" }[] = [
  { label: "紧凑", sub: "8 px",  value: "small" },
  { label: "标准", sub: "14 px", value: "medium" },
  { label: "圆角", sub: "22 px", value: "large" },
  { label: "胶囊", sub: "32 px", value: "very_large" },
];

// Utils 
function hexToRgba(hex: string, a: number) {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Section label
function SectionLabel({ children }: { children: string }) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <Text style={{
      fontSize: 11, fontWeight: "600", color: colors.muted, fontFamily: ff,
      letterSpacing: 0.6, textTransform: "uppercase",
      paddingHorizontal: 2,
    }}>
      {children}
    </Text>
  );
}

// Live preview card
function Preview({
  accentColor, radius, coursePaletteKey,
}: {
  accentColor: string; radius: number; coursePaletteKey: PaletteKey;
}) {
  const colors    = useColors();
  const palette   = COURSE_PALETTES[coursePaletteKey].colors;
  const cardR     = Math.max(radius - 2, 6);
  const MOCK = [
    { name: "高等数学", period: "8:00–9:35", room: "东4-101",color:"#0a7ea4"  },
    { name: "大学物理", period: "10:00–11:35", room: "东1A-208",color:"#3b82f6"  },
    { name: "军事理论", period: "13:25–14:310", room: "西2-306",color:"#06b6d4"  },
    { name: "心理学及应用", period: "13:25–15:50",room: "北3-411",color:"#10b981"  },
    { name: "程序设计", period: "17:00–17:50",room:"曹西彪楼105",color:"#159243" },
  ];
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

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
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", fontFamily: ff }}>Z</Text>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ width: 72, height: 9, borderRadius: 4, backgroundColor: colors.foreground, opacity: 0.75 }} />
          <View style={{ width: 108, height: 7, borderRadius: 3, backgroundColor: colors.muted, opacity: 0.4 }} />
        </View>
        <View style={{
          paddingHorizontal: 9, paddingVertical: 4, borderRadius: cardR,
          backgroundColor: hexToRgba(accentColor, 0.13),
        }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: accentColor, fontFamily: ff }}>周一</Text>
        </View>
      </View>

      {/* Course blocks */}
      <View style={{ padding: 12, gap: 8 }}>
        {MOCK.map((c, i) => {
          const blockColor = palette[i % palette.length];
          return (
            <View style={{
              borderRadius: cardR, backgroundColor: colors.background,
              overflow: "hidden", 
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
            }}>
              <View style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: 4, backgroundColor: c.color,
              }} />
              <View style={{ paddingLeft: 17, paddingRight: 14, paddingVertical: 13, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{
                    flex: 1, fontSize: 15, fontWeight: "500", fontFamily: ff,
                    color: colors.foreground, lineHeight: 20,
                  }} numberOfLines={2}>
                    {c.name}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <IconSymbol name="clock.fill" size={12} color={c.color} />
                    <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground, fontFamily: ff }}>
                      {c.period }
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                    <IconSymbol name="location.fill" size={12} color={colors.muted} />
                    <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }} numberOfLines={1}>
                      {c.room}
                    </Text>
                  </View>
                </View>
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
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

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
          fontSize: 15, fontWeight: isActive ? "600" : "400", fontFamily: ff,
          color: isActive ? primaryColor : colors.foreground,
        }}>
          {palette.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>{palette.desc}</Text>
      </View>

      {/* Check */}
      {isActive ? (
        <View style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: primaryColor,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700", fontFamily: ff }}>✓</Text>
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
  const { state, fetchScheduleBySemester, refreshAllSemesters, resetScheduleLoading } = useSchedule();
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
  const { fontFamily, setFontFamily } = useTheme();
  const [previewFont, setpreviewFont] = useState<FontFamily>(fontFamily);
  const ff = FONT_FAMILY_META[fontFamily].value;


  const handleFontPress = async (key: FontFamily) => {
    setpreviewFont(key);
    await setFontFamily(key);
  };

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

  const handleRadiusPress = async (value: "small" | "medium" | "large" | "very_large") => {
    setPreviewRadius(value);
    await setCardRadius(value);
  };

  const handlePalettePress = async (key: PaletteKey) => {
    setPreviewPalette(key);
    await setCoursePaletteKey(key);
    const username = await AsyncStorage.getItem("username");
    if (!username) return;
    const allSemesters = await loadActiveSemesters(username);
    
    if (!allSemesters || allSemesters.length === 0) return;
    for (const sem of allSemesters) {
      const courses = await fetchScheduleBySemester(sem.yearValue, sem.termValue); // 加载课程数据以应用新配色
      if (!courses || courses.length === 0) continue;
      const converted = assignColors(courses);
      AsyncStorage.setItem(`schedule_${sem.yearValue}_${sem.termValue}`, JSON.stringify(converted));
    }
    
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
          flex: 1, textAlign: "center", fontFamily: ff,
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
          <Text style={{ fontSize: 14, fontWeight: "500", color: previewAccent, fontFamily: ff }}>重置</Text>
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
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground, fontFamily: ff }}>
                  {ACCENT_COLORS.find(c => c.value === previewAccent)?.name ?? "自定义"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
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
                      style={{ fontSize: 9, color: sel ? colors.foreground : colors.muted, width: 44, textAlign: "center", fontFamily: ff }}
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
                    // shadowColor: active ? previewAccent : "#000",
                    // shadowOffset: { width: 0, height: active ? 3 : 1 },
                    // shadowOpacity: active ? 0.2 : 0.05,
                    // shadowRadius: active ? 6 : 3,
                    // elevation: active ? 3 : 1,
                  }}
                >
                  {/* <View style={{
                    width: 40, height: 28, borderRadius: optRv,
                    backgroundColor: active ? previewAccent : colors.muted,
                    opacity: active ? 0.8 : 0.3,
                  }} /> */}
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={{
                      fontSize: 14, fontWeight: active ? "600" : "400", fontFamily: ff,
                      color: active ? previewAccent : colors.foreground,
                    }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.muted, fontFamily: ff }}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 字体样式 */}
        <View style={{ gap: 9 }}>
          <SectionLabel>字体样式</SectionLabel>
          <View style={{
            flexDirection: "row", gap: 10,
            backgroundColor: colors.background,
            borderRadius: rv, borderWidth: 0.5, borderColor: colors.border,
            padding: 12,
          }}>
            {(Object.keys(FONT_FAMILY_META) as FontFamily[]).map(key => {
              const meta = FONT_FAMILY_META[key];
              const isActive = previewFont === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleFontPress(key)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1, alignItems: "center", gap: 5,
                    paddingVertical: 14, borderRadius: Math.max(rv - 4, 6),
                    backgroundColor: isActive ? hexToRgba(previewAccent, 0.1) : colors.surface,
                    borderWidth: isActive ? 1.5 : 0.5,
                    borderColor: isActive ? previewAccent : colors.border,
                    // shadowColor: isActive ? previewAccent : "transparent",
                    // shadowOffset: { width: 0, height: 2 },
                    // shadowOpacity: isActive ? 0.18 : 0,
                    // shadowRadius: 5, elevation: isActive ? 2 : 0,
                  }}
                >
                  {/* 字体预览大字 */}
                  <Text style={{
                    fontSize: 20, fontWeight: "700",
                    color: isActive ? previewAccent : colors.foreground,
                    fontFamily: meta.value,
                  }}>
                    Aa汉
                  </Text>
                  <Text style={{
                    fontSize: 12, fontWeight: isActive ? "600" : "400",
                    color: isActive ? previewAccent : colors.foreground,
                    fontFamily: meta.value,
                  }}>
                    {meta.label}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.muted,fontFamily: meta.value, }}>{meta.sub}</Text>
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
            <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
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
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: ff }}>
            所有更改实时生效并自动保存。课程色彩方案会在下次切换学期或刷新课表后完整呈现。
          </Text>
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}
