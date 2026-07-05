/**
 * 自定义课程管理页：列表 + 添加表单。
 * 用户手动添加的实验课/社团/补课等，仅存本地（pref_ 前缀，清缓存不丢）。
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, ScrollView, Text, TextInput, TouchableOpacity, View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { CommonNavBar } from "@/components/common/nav-bar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import { useAuth } from "@/lib/auth-context";
import { useTheme, CARD_RADIUS_VALUES, FONT_FAMILY_META } from "@/lib/theme-provider";
import { COURSE_PALETTES } from "@/lib/course-palette";
import { PERIODS } from "@/lib/course-time";
import {
  addCustomCourse, loadCustomCourses, removeCustomCourse, type CustomCourse,
} from "@/lib/custom-courses";

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEK_TYPE_OPTIONS = [
  { value: "both" as const,   label: "每周" },
  { value: "single" as const, label: "单周" },
  { value: "double" as const, label: "双周" },
];

function Chip({ label, active, onPress, color }: {
  label: string; active: boolean; onPress: () => void; color?: string;
}) {
  const colors = useColors();
  const { primaryColor, fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  const activeColor = color ?? primaryColor;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
        backgroundColor: active ? activeColor : colors.surface,
        borderWidth: 0.5, borderColor: active ? activeColor : colors.border,
      }}
    >
      <Text style={{
        fontSize: 13, fontFamily: ff,
        color: active ? "#fff" : colors.foreground,
        fontWeight: active ? "600" : "400",
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FieldLabel({ children }: { children: string }) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, fontFamily: ff, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

export default function CustomCoursesScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const { state: authState } = useAuth();
  const { primaryColor, cardRadius, coursePaletteKey, fontFamily } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  const ff = FONT_FAMILY_META[fontFamily].value;
  const username = authState.username;
  const paletteColors = COURSE_PALETTES[coursePaletteKey].colors;

  const [list, setList] = useState<CustomCourse[]>([]);
  const [showForm, setShowForm] = useState(false);

  // ── 表单状态 ────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [classroom, setClassroom] = useState("");
  const [teacher, setTeacher] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(2);
  const [weekStart, setWeekStart] = useState("1");
  const [weekEnd, setWeekEnd] = useState("16");
  const [weekType, setWeekType] = useState<"both" | "single" | "double">("both");
  const [color, setColor] = useState(paletteColors[0]);

  const reload = useCallback(async () => {
    setList(await loadCustomCourses(username));
  }, [username]);

  useEffect(() => { reload(); }, [reload]);

  const resetForm = () => {
    setName(""); setClassroom(""); setTeacher("");
    setDayOfWeek(1); setStartPeriod(1); setEndPeriod(2);
    setWeekStart("1"); setWeekEnd("16"); setWeekType("both");
    setColor(paletteColors[0]);
  };

  const handleSave = async () => {
    if (!username) { Alert.alert("提示", "请先登录"); return; }
    if (!name.trim()) { Alert.alert("提示", "请填写课程名称"); return; }
    const ws = parseInt(weekStart), we = parseInt(weekEnd);
    if (isNaN(ws) || isNaN(we) || ws < 1 || we > 20 || ws > we) {
      Alert.alert("提示", "周次范围无效（1-20，起始不能大于结束）");
      return;
    }
    if (startPeriod > endPeriod) { Alert.alert("提示", "开始节次不能晚于结束节次"); return; }

    const st = PERIODS.find(p => p.number === startPeriod)?.startTime;
    const et = PERIODS.find(p => p.number === endPeriod)?.endTime;

    await addCustomCourse(username, {
      name: name.trim(),
      teacher: teacher.trim(),
      classroom: classroom.trim(),
      dayOfWeek,
      startPeriod,
      endPeriod,
      weekStart: ws,
      weekEnd: we,
      isSingleWeek: weekType,
      periodTime: st && et ? `${st}—${et}` : undefined,
      color,
    });
    resetForm();
    setShowForm(false);
    await reload();
  };

  const handleDelete = (c: CustomCourse) => {
    if (!username) return;
    Alert.alert("删除课程", `确定删除「${c.name}」吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除", style: "destructive",
        onPress: async () => { await removeCustomCourse(username, c.id); await reload(); },
      },
    ]);
  };

  const weekTypeLabel = (c: CustomCourse) =>
    c.isSingleWeek === "single" ? "单周" : c.isSingleWeek === "double" ? "双周" : "";

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <CommonNavBar title="自定义课程" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff, lineHeight: 18 }}>
          添加实验课、社团活动、补课等不在教务系统里的日程，会和正式课表一起显示在课表与首页中。数据仅保存在本机。
        </Text>

        {/* ── 已添加列表 ── */}
        {list.map(c => (
          <View key={c.id} style={{
            borderRadius: r, backgroundColor: colors.background, overflow: "hidden",
            ...cardShadow(scheme, { offsetY: 1, opacity: 0.06, radius: 5, elevation: 2 }),
          }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: c.color }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 17, paddingRight: 12, paddingVertical: 12, gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground, fontFamily: ff }} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
                  {DAY_LABELS[c.dayOfWeek - 1]} 第{c.startPeriod}-{c.endPeriod}节 · {c.weekStart}-{c.weekEnd}周{weekTypeLabel(c)}
                  {c.classroom ? ` · ${c.classroom}` : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(c)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <IconSymbol name="trash.fill" size={19} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {list.length === 0 && !showForm && (
          <View style={{
            backgroundColor: colors.background, borderRadius: r,
            borderWidth: 0.5, borderColor: colors.border,
            padding: 20, alignItems: "center",
          }}>
            <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>还没有自定义课程</Text>
          </View>
        )}

        {/* ── 添加按钮 / 表单 ── */}
        {!showForm ? (
          <TouchableOpacity
            onPress={() => setShowForm(true)}
            activeOpacity={0.8}
            style={{
              backgroundColor: primaryColor, borderRadius: r,
              paddingVertical: 13, alignItems: "center",
              flexDirection: "row", justifyContent: "center", gap: 6,
            }}
          >
            <IconSymbol name="plus.circle.fill" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15, fontFamily: ff }}>添加自定义课程</Text>
          </TouchableOpacity>
        ) : (
          <View style={{
            borderRadius: r, backgroundColor: colors.background, padding: 16, gap: 16,
            ...cardShadow(scheme, { offsetY: 2, opacity: 0.08, radius: 8, elevation: 3 }),
          }}>
            <View>
              <FieldLabel>课程名称 *</FieldLabel>
              <TextInput
                placeholder="如：大物实验 / 篮球社训练"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                style={{
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  color: colors.foreground, fontSize: 14, fontFamily: ff,
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>地点</FieldLabel>
                <TextInput
                  placeholder="选填"
                  placeholderTextColor={colors.muted}
                  value={classroom}
                  onChangeText={setClassroom}
                  style={{
                    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                    color: colors.foreground, fontSize: 14, fontFamily: ff,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>教师 / 备注</FieldLabel>
                <TextInput
                  placeholder="选填"
                  placeholderTextColor={colors.muted}
                  value={teacher}
                  onChangeText={setTeacher}
                  style={{
                    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                    color: colors.foreground, fontSize: 14, fontFamily: ff,
                  }}
                />
              </View>
            </View>

            <View>
              <FieldLabel>星期</FieldLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {DAY_LABELS.map((label, i) => (
                  <Chip key={label} label={label} active={dayOfWeek === i + 1} onPress={() => setDayOfWeek(i + 1)} />
                ))}
              </View>
            </View>

            <View>
              <FieldLabel>{`节次（第 ${startPeriod} - ${endPeriod} 节）`}</FieldLabel>
              <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff, marginBottom: 6 }}>开始节次</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {PERIODS.map(p => (
                  <Chip
                    key={`s${p.number}`}
                    label={String(p.number)}
                    active={startPeriod === p.number}
                    onPress={() => {
                      setStartPeriod(p.number);
                      if (p.number > endPeriod) setEndPeriod(p.number);
                    }}
                  />
                ))}
              </ScrollView>
              <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff, marginVertical: 6 }}>结束节次</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {PERIODS.map(p => (
                  <Chip
                    key={`e${p.number}`}
                    label={String(p.number)}
                    active={endPeriod === p.number}
                    onPress={() => {
                      setEndPeriod(p.number);
                      if (p.number < startPeriod) setStartPeriod(p.number);
                    }}
                  />
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>周次</FieldLabel>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    value={weekStart}
                    onChangeText={setWeekStart}
                    keyboardType="number-pad"
                    maxLength={2}
                    style={{
                      flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      color: colors.foreground, fontSize: 14, fontFamily: ff, textAlign: "center",
                    }}
                  />
                  <Text style={{ color: colors.muted, fontFamily: ff }}>—</Text>
                  <TextInput
                    value={weekEnd}
                    onChangeText={setWeekEnd}
                    keyboardType="number-pad"
                    maxLength={2}
                    style={{
                      flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      color: colors.foreground, fontSize: 14, fontFamily: ff, textAlign: "center",
                    }}
                  />
                </View>
              </View>
              <View style={{ flex: 1.4 }}>
                <FieldLabel>单双周</FieldLabel>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {WEEK_TYPE_OPTIONS.map(o => (
                    <Chip key={o.value} label={o.label} active={weekType === o.value} onPress={() => setWeekType(o.value)} />
                  ))}
                </View>
              </View>
            </View>

            <View>
              <FieldLabel>颜色</FieldLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {paletteColors.map(pc => (
                  <TouchableOpacity
                    key={pc}
                    onPress={() => setColor(pc)}
                    activeOpacity={0.8}
                    style={{
                      width: 30, height: 30, borderRadius: 15, backgroundColor: pc,
                      borderWidth: color === pc ? 3 : 0.5,
                      borderColor: color === pc ? colors.foreground : colors.border,
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowForm(false); resetForm(); }}
                activeOpacity={0.8}
                style={{
                  flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: r,
                  backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.muted, fontFamily: ff }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                activeOpacity={0.8}
                style={{ flex: 2, paddingVertical: 12, alignItems: "center", borderRadius: r, backgroundColor: primaryColor }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff", fontFamily: ff }}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
