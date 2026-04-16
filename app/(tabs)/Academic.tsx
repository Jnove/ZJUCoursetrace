import {
  ScrollView, Text, View, TouchableOpacity,
  ActivityIndicator, Animated, RefreshControl, Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadSession, fetchGrade, fetchMajorGrade, fetchExams, fetchHomeworks,
  Grade, ExamInfo, HomeworkInfo,
} from "@/lib/zju-client";
import { useRouter } from "expo-router";
import { writeLog } from "@/lib/diagnostic-log";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";

// ─── Cache ────────────────────────────────────────────────────────────────────

function cacheKey(type: "major_grade" | "all_grade" | "exams" | "homeworks", u: string) {
  return `academic_${type}_${u}`;
}
async function readCache<T>(k: string): Promise<T | null> {
  try { const r = await AsyncStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function writeCache(k: string, d: unknown) {
  try { await AsyncStorage.setItem(k, JSON.stringify(d)); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rgba = (hex: string, a: number) => {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${a})`;
};

function parseExamDate(s: string): Date | null {
  let m = s.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return null;
}
function daysUntil(d: Date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tgt   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((tgt.getTime() - today.getTime()) / 86400000);
}
function fmtExamTime(s: string) {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s*([\d:]+)?(?:[—\-]([\d:]+))?/);
  if (!m) return s;
  const mo = parseInt(m[2]), da = parseInt(m[3]);
  const t  = m[4] ? (m[5] ? `${m[4]}—${m[5]}` : m[4]) : "";
  return `${mo}月${da}日${t ? "  " + t : ""}`;
}

// homework helpers
const hwPast   = (iso: string) => !!iso && new Date(iso) < new Date();
const hwToday  = (iso: string) => {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
};
const hwWeek   = (iso: string) => {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  const s = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const e = new Date(s); e.setDate(e.getDate()+7);
  return d >= s && d < e;
};

// exam semester grouping
function semType(sem?: string): "春夏"|"秋冬"|"未知" {
  if (!sem) return "未知";
  if (/春|夏/.test(sem)) return "春夏";
  if (/秋|冬/.test(sem)) return "秋冬";
  if (/^1/.test(sem)) return "秋冬";
  return "春夏";
}
function semEndDate(yearStr: string, type: string) {
  const endY = parseInt(yearStr.slice(5,9));
  return type === "秋冬" ? new Date(endY,0,20) : new Date(endY,5,30);
}
function extractSem(e: ExamInfo) {
  let year = e.year;
  if (!year && e.semester) { const m = e.semester.match(/(\d{4}-\d{4})/); if (m) year = m[1]; }
  if (!year) { const d = parseExamDate(e.examTime); if (d) { const y=d.getFullYear(); year=`${y}-${y+1}`; } else year="未知学年"; }
  const type = semType(e.semester);
  return { year, type, displayName: `${year} ${type}`, endDate: semEndDate(year, type) };
}
function groupExams(exams: ExamInfo[]) {
  const m = new Map<string,{key:string;displayName:string;endDate:Date;exams:ExamInfo[]}>();
  for (const e of exams) {
    const {year,type,displayName,endDate} = extractSem(e);
    const k = `${year}-${type}`;
    if (!m.has(k)) m.set(k,{key:k,displayName,endDate,exams:[]});
    m.get(k)!.exams.push(e);
  }
  for (const g of m.values()) g.exams.sort((a,b)=>(parseExamDate(a.examTime)?.getTime()??0)-(parseExamDate(b.examTime)?.getTime()??0));
  return m;
}
function nearestFuture(exams: ExamInfo[]) {
  const today = new Date(); today.setHours(0,0,0,0);
  let n: Date|null = null;
  for (const e of exams) { const d=parseExamDate(e.examTime); if (d&&d>=today&&(!n||d<n)) n=d; }
  return n;
}

// ─── Tokens ───────────────────────────────────────────────────────────────────
const HW_ACCENT   = "#7c3aed";   // violet-700
const EXAM_ACCENT = "#ea580c";   // orange-600
const PAST_COLOR  = "#6b7280";   // gray-500
const GPA_KEY     = "pref_gpa_hidden";

// ─── Shared primitives ────────────────────────────────────────────────────────

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: bg }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color, lineHeight: 14 }}>{label}</Text>
    </View>
  );
}

function SectionLabel({ title, badge, action, busy }: {
  title: string; badge?: number|string;
  action?: {label:string; onPress:()=>void}; busy?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
      <Text style={{ fontSize:15, fontWeight:"600", color:colors.foreground }}>{title}</Text>
      {badge !== undefined && (
        <View style={{
          paddingHorizontal:7, paddingVertical:1, borderRadius:8,
          backgroundColor:colors.surface, borderWidth:0.5, borderColor:colors.border,
        }}>
          <Text style={{ fontSize:11, color:colors.muted, fontWeight:"500" }}>{badge}</Text>
        </View>
      )}
      {busy && <ActivityIndicator size="small" color={colors.muted} style={{opacity:0.4}} />}
      {action && (
        <TouchableOpacity onPress={action.onPress} style={{ marginLeft:"auto" }}>
          <Text style={{ fontSize:13, color:colors.primary }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── GPA card ─────────────────────────────────────────────────────────────────

function gpaColor(gpa: number, colors: any) {
  if (gpa >= 3.7) return colors.success;
  if (gpa >= 3.0) return colors.primary;
  if (gpa >= 2.0) return colors.warning;
  return colors.error;
}

function GpaColumn({ title, gpa, credits, loading, color, bg, hidden, radius }: {
  title:string; gpa:number; credits:number; loading:boolean;
  color:string; bg:string; hidden:boolean; radius:number;
}) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(hidden?0:1)).current;
  useEffect(() => {
    Animated.timing(opacity,{toValue:hidden?0:1,duration:200,useNativeDriver:true}).start();
  },[hidden]);

  return (
    <View style={{flex:1,backgroundColor:bg,borderRadius:Math.max(radius-6,6),padding:14,gap:8}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
        <View style={{width:5,height:5,borderRadius:3,backgroundColor:color}}/>
        <Text style={{fontSize:11,fontWeight:"600",color,letterSpacing:0.3}}>{title}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={color} style={{alignSelf:"flex-start"}} />
      ) : hidden ? (
        <View style={{flexDirection:"row",gap:6,alignItems:"flex-end",height:44}}>
          {[0,1,2].map(i=><Text key={i} style={{fontSize:28,color,lineHeight:36,opacity:0.7}}>•</Text>)}
        </View>
      ) : (
        <Animated.View style={{opacity}}>
          <View style={{flexDirection:"row",alignItems:"baseline",gap:2}}>
            <Text style={{fontSize:30,fontWeight:"500",color,fontVariant:["tabular-nums"],lineHeight:34}}>
              {gpa.toFixed(2)}
            </Text>
            <Text style={{fontSize:11,color,opacity:0.6}}>/5</Text>
          </View>
        </Animated.View>
      )}

      {!loading && !hidden && (
        <>
          <View style={{height:3,borderRadius:2,backgroundColor:rgba(color,0.15),overflow:"hidden"}}>
            <View style={{height:"100%",width:`${(gpa/5)*100}%` as any,borderRadius:2,backgroundColor:color}} />
          </View>
          <Text style={{fontSize:10,color,opacity:0.7}}>{credits} 学分</Text>
        </>
      )}
    </View>
  );
}

function GpaCard({
  majorGpa, majorCredits, majorLoading, majorError, onRetryMajor,
  allGpa, allCredits, allLoading, allError, onRetryAll,
  hidden, onToggle, onPress, stale, radius,
}: {
  majorGpa:number; majorCredits:number; majorLoading:boolean; majorError:string|null; onRetryMajor:()=>void;
  allGpa:number; allCredits:number; allLoading:boolean; allError:string|null; onRetryAll:()=>void;
  hidden:boolean; onToggle:()=>void; onPress:()=>void; stale:boolean; radius:number;
}) {
  const colors = useColors();
  const c1 = gpaColor(majorGpa, colors);
  const c2 = gpaColor(allGpa,   colors);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={{
      borderRadius:radius, backgroundColor:colors.background, overflow:"hidden",
      shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:12, elevation:4,
    }}>
      {/* top stripe dual-color */}
      <View style={{flexDirection:"row",height:3}}>
        <View style={{flex:1,backgroundColor:c1}}/>
        <View style={{flex:1,backgroundColor:c2}}/>
      </View>

      <View style={{padding:18,gap:14}}>
        {/* header */}
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
          <Text style={{fontSize:13,fontWeight:"500",color:colors.muted,letterSpacing:0.2}}>绩点概览</Text>
          <View style={{flexDirection:"row",alignItems:"center",gap:10}}>
            {stale && <ActivityIndicator size="small" color={colors.muted} style={{opacity:0.4}}/>}
            <TouchableOpacity
              onPress={e=>{e.stopPropagation();onToggle();}}
              hitSlop={{top:10,bottom:10,left:10,right:10}}
            >
              <IconSymbol name={hidden?"eye.slash":"eye"} size={16} color={colors.muted}/>
            </TouchableOpacity>
          </View>
        </View>

        {/* columns */}
        <View style={{flexDirection:"row",gap:10}}>
          <GpaColumn
            title="主修" gpa={majorGpa} credits={majorCredits}
            loading={majorLoading} color={c1} bg={rgba(c1,0.08)} hidden={hidden} radius={radius}
          />
          <GpaColumn
            title="全部" gpa={allGpa} credits={allCredits}
            loading={allLoading} color={c2} bg={rgba(c2,0.08)} hidden={hidden} radius={radius}
          />
        </View>

        {/* errors */}
        {majorError && (
          <TouchableOpacity onPress={onRetryMajor}>
            <Text style={{fontSize:12,color:colors.error}}>{majorError} · 点击重试</Text>
          </TouchableOpacity>
        )}
        {allError && (
          <TouchableOpacity onPress={onRetryAll}>
            <Text style={{fontSize:12,color:colors.error}}>{allError} · 点击重试</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Homework summary card ────────────────────────────────────────────────────

function StatBox({ label, value, color, bg, highlight, radius }: {
  label:string; value:number; color:string; bg:string; highlight:boolean; radius:number;
}) {
  const colors = useColors();
  return (
    <View style={{
      flex:1, backgroundColor:bg, borderRadius:Math.max(radius-6,6), padding:12, gap:6,
      borderWidth: highlight ? 1 : 0, borderColor: rgba(color, 0.25),
    }}>
      <Text style={{fontSize:10,color:colors.muted,letterSpacing:0.2}}>{label}</Text>
      <View style={{flexDirection:"row",alignItems:"baseline",gap:2}}>
        <Text style={{fontSize:24,fontWeight:"500",color,fontVariant:["tabular-nums"],lineHeight:28}}>
          {value}
        </Text>
        <Text style={{fontSize:11,color,opacity:0.7}}>项</Text>
      </View>
    </View>
  );
}

function CourseCountBox({ value, bg, color, radius }: {value:number;bg:string;color:string;radius:number}) {
  const colors = useColors();
  return (
    <View style={{
      flex:1, backgroundColor:bg, borderRadius:Math.max(radius-6,6), padding:12, gap:6,
    }}>
      <Text style={{fontSize:10,color:colors.muted,letterSpacing:0.2}}>本学期课程</Text>
      <View style={{flexDirection:"row",alignItems:"baseline",gap:2}}>
        <Text style={{fontSize:24,fontWeight:"500",color,fontVariant:["tabular-nums"],lineHeight:28}}>
          {value}
        </Text>
        <Text style={{fontSize:11,color,opacity:0.7}}>门</Text>
      </View>
    </View>
  );
}

function HomeworkSummaryCard({ homeworks, loading, error, onRetry, stale, radius, onPress }: {
  homeworks:HomeworkInfo[]; loading:boolean; error:string|null;
  onRetry:()=>void; stale:boolean; radius:number; onPress:()=>void;
}) {
  const colors = useColors();
  const courses  = new Set(homeworks.map(h=>h.courseId)).size;
  const pending  = homeworks.filter(h=>!h.submitted && !hwPast(h.deadlineIso)).length;
  const today    = homeworks.filter(h=>!h.submitted && hwToday(h.deadlineIso)).length;
  const week     = homeworks.filter(h=>!h.submitted && hwWeek(h.deadlineIso)).length;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={loading && homeworks.length===0}
      style={{
        borderRadius:radius, backgroundColor:colors.background, overflow:"hidden",
        shadowColor:HW_ACCENT, shadowOffset:{width:0,height:2},
        shadowOpacity:0.1, shadowRadius:12, elevation:4,
      }}
    >
      <View style={{height:3,backgroundColor:HW_ACCENT}}/>

      <View style={{padding:18,gap:14}}>
        {/* header */}
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
          <Text style={{fontSize:13,fontWeight:"500",color:colors.muted,letterSpacing:0.2}}>作业</Text>
          <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
            {stale && <ActivityIndicator size="small" color={colors.muted} style={{opacity:0.4}}/>}
            {!loading && (
              <View style={{flexDirection:"row",alignItems:"center",gap:4}}>
                <Text style={{fontSize:12,color:colors.muted}}>查看详情</Text>
                <IconSymbol name="chevron.right" size={12} color={colors.muted}/>
              </View>
            )}
          </View>
        </View>

        {loading && homeworks.length===0 ? (
          <View style={{alignItems:"center",paddingVertical:12}}>
            <ActivityIndicator color={HW_ACCENT}/>
          </View>
        ) : error && homeworks.length===0 ? (
          <TouchableOpacity onPress={onRetry}>
            <Text style={{fontSize:13,color:colors.error}}>{error} · 点击重试</Text>
          </TouchableOpacity>
        ) : (
          <View style={{gap:10}}>
            {/* row 1 */}
            <View style={{flexDirection:"row",gap:10}}>
              <CourseCountBox
                value={courses}
                color={colors.primary}
                bg={rgba(colors.primary,0.07)}
                radius={radius}
              />
              <StatBox
                label="待提交作业" value={pending}
                color={pending>0 ? HW_ACCENT : colors.success}
                bg={rgba(pending>0 ? HW_ACCENT : colors.success, 0.07)}
                highlight={pending>0} radius={radius}
              />
            </View>
            {/* row 2 */}
            <View style={{flexDirection:"row",gap:10}}>
              <StatBox
                label="今日截止" value={today}
                color={today>0 ? colors.error : colors.muted}
                bg={rgba(today>0 ? colors.error : colors.muted, 0.07)}
                highlight={today>0} radius={radius}
              />
              <StatBox
                label="七天内截止" value={week}
                color={week>0 ? colors.warning : colors.muted}
                bg={rgba(week>0 ? colors.warning : colors.muted, 0.07)}
                highlight={week>0} radius={radius}
              />
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Exam cards ───────────────────────────────────────────────────────────────

function DaysBadge({ days }: { days:number }) {
  const colors = useColors();
  if (days<0) return <Pill label="已结束" color={PAST_COLOR} bg={rgba(PAST_COLOR,0.1)}/>;
  if (days===0) return <Pill label="今天" color={colors.error} bg={rgba(colors.error,0.12)}/>;
  if (days===1) return <Pill label="明天" color={colors.warning} bg={rgba(colors.warning,0.12)}/>;
  const c = days<=7 ? colors.warning : EXAM_ACCENT;
  return <Pill label={`${days} 天后`} color={c} bg={rgba(c,0.1)}/>;
}

function ExamCard({ exam, isPast=false, compact=false, radius=12 }: {
  exam:ExamInfo; isPast?:boolean; compact?:boolean; radius?:number;
}) {
  const colors = useColors();
  const accent = isPast ? PAST_COLOR : EXAM_ACCENT;
  const date   = parseExamDate(exam.examTime);
  const days   = date ? daysUntil(date) : -999;

  return (
    <View style={{
      borderRadius:radius, backgroundColor:colors.background, overflow:"hidden",
      shadowColor:"#000", shadowOffset:{width:0,height:1},
      shadowOpacity:isPast?0.03:0.06, shadowRadius:6, elevation:isPast?1:2,
      opacity:isPast?0.68:1,
      paddingLeft:compact?12:16, paddingRight:compact?12:14,
      paddingVertical:compact?9:12,
    }}>
      {/* left bar */}
      <View style={{position:"absolute",left:0,top:0,bottom:0,width:3,backgroundColor:accent}}/>
      <View style={{gap:compact?3:5}}>
        <View style={{flexDirection:"row",alignItems:"flex-start",gap:8}}>
          <Text style={{
            flex:1, fontSize:compact?13:14, fontWeight:"500",
            color:colors.foreground, lineHeight:compact?17:19,
          }} numberOfLines={2}>
            {exam.courseName}
          </Text>
          {date && <DaysBadge days={days}/>}
        </View>
        <View style={{flexDirection:"row",alignItems:"center",gap:5}}>
          <IconSymbol name="clock.fill" size={compact?9:10} color={accent}/>
          <Text style={{fontSize:compact?12:13,fontWeight:"500",color:colors.foreground}}>
            {fmtExamTime(exam.examTime)}
          </Text>
        </View>
        <View style={{flexDirection:"row",alignItems:"center",gap:10}}>
          <View style={{flexDirection:"row",alignItems:"center",gap:4,flex:1}}>
            <IconSymbol name="location.fill" size={compact?8:9} color={colors.muted}/>
            <Text style={{fontSize:compact?12:13,color:colors.muted}} numberOfLines={1}>
              {exam.examLocation||"地点待定"}
            </Text>
          </View>
          {exam.seat&&(
            <View style={{paddingHorizontal:7,paddingVertical:2,borderRadius:5,backgroundColor:rgba(accent,0.1)}}>
              <Text style={{fontSize:11,fontWeight:"600",color:accent}}>座位 {exam.seat}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function ExamGroup({ group, isPast=false, radius=12 }: {
  group:{key:string;displayName:string;endDate:Date;exams:ExamInfo[]};
  isPast?:boolean; radius?:number;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const near = !isPast ? nearestFuture(group.exams) : null;

  let main: ExamInfo[] = group.exams;
  let rest: ExamInfo[] = [];
  if (!isPast && near) {
    main = group.exams.filter(e => { const d=parseExamDate(e.examTime); return d&&d.toDateString()===near.toDateString(); });
    rest = group.exams.filter(e => { const d=parseExamDate(e.examTime); return !d||d.toDateString()!==near.toDateString(); });
  }

  return (
    <View style={{gap:8}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
        <SectionLabel title={group.displayName} badge={group.exams.length}/>
        {!isPast && !expanded && rest.length>0 && (
          <TouchableOpacity onPress={()=>setExpanded(true)} style={{marginLeft:"auto"}}>
            <Text style={{fontSize:12,color:colors.primary}}>+{rest.length} 场</Text>
          </TouchableOpacity>
        )}
        {expanded && (
          <TouchableOpacity onPress={()=>setExpanded(false)} style={{marginLeft:"auto"}}>
            <Text style={{fontSize:12,color:colors.muted}}>收起</Text>
          </TouchableOpacity>
        )}
      </View>
      {main.map((e,i)=><ExamCard key={`m-${i}`} exam={e} isPast={isPast} compact={false} radius={radius}/>)}
      {expanded && rest.map((e,i)=><ExamCard key={`r-${i}`} exam={e} isPast={isPast} compact radius={radius}/>)}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AcademicScreen() {
  const { state: authState } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];

  // GPA
  const [majorGpa, setMajorGpa] = useState(0);
  const [majorCredits, setMajorCredits] = useState(0);
  const [majorLoading, setMajorLoading] = useState(true);
  const [majorError, setMajorError] = useState<string|null>(null);
  const [majorStale, setMajorStale] = useState(false);

  const [allGpa, setAllGpa] = useState(0);
  const [allCredits, setAllCredits] = useState(0);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string|null>(null);
  const [allStale, setAllStale] = useState(false);

  // Exams
  const [exams, setExams]         = useState<ExamInfo[]>([]);
  const [examLoading, setExamLoading] = useState(true);
  const [examError, setExamError]   = useState<string|null>(null);
  const [examStale, setExamStale]   = useState(false);

  // Homework
  const [homeworks, setHomeworks]           = useState<HomeworkInfo[]>([]);
  const [homeworkLoading, setHomeworkLoading] = useState(true);
  const [homeworkError, setHomeworkError]     = useState<string|null>(null);
  const [homeworkStale, setHomeworkStale]     = useState(false);

  // UI
  const [gpaHidden, setGpaHidden]           = useState(false);
  const [showPast, setShowPast]             = useState(false);
  const [refreshing, setRefreshing]         = useState(false);

  // ── loaders ────────────────────────────────────────────────────────────────

  const loadMajor = useCallback(async (force=false) => {
    const u = await AsyncStorage.getItem("username");
    if (!u) { setMajorError("请先登录"); setMajorLoading(false); return; }
    const k = cacheKey("major_grade", u);
    if (!force) {
      const c = await readCache<{gpa:number;totalCredits:number;grades:Grade[]}>(k);
      if (c) {
        setMajorGpa(c.gpa); setMajorCredits(c.totalCredits);
        setMajorLoading(false); setMajorError(null); setMajorStale(true);
        try { const s=await loadSession(); if(s){const r=await fetchMajorGrade(s);setMajorGpa(r.gpa);setMajorCredits(r.totalCredits);await writeCache(k,r);} } catch{}
        finally{setMajorStale(false);}
        return;
      }
    }
    setMajorLoading(true); setMajorError(null);
    try {
      const s = await loadSession(); if(!s){setMajorError("请先登录");return;}
      const res = await fetchMajorGrade(s);
      setMajorGpa(res.gpa); setMajorCredits(res.totalCredits); await writeCache(k,res);
    } catch(e){setMajorError(e instanceof Error?e.message:"获取主修绩点失败");}
    finally{setMajorLoading(false);}
  },[]);

  const loadAll = useCallback(async (force=false) => {
    const u = await AsyncStorage.getItem("username");
    if (!u) { setAllError("请先登录"); setAllLoading(false); return; }
    const k = cacheKey("all_grade", u);
    if (!force) {
      const c = await readCache<{gpa:number;totalCredits:number;grades:Grade[]}>(k);
      if (c) {
        setAllGpa(c.gpa); setAllCredits(c.totalCredits);
        setAllLoading(false); setAllError(null); setAllStale(true);
        try { const s=await loadSession(); if(s){const r=await fetchGrade(s);setAllGpa(r.gpa);setAllCredits(r.totalCredits);await writeCache(k,r);} } catch{}
        finally{setAllStale(false);}
        return;
      }
    }
    setAllLoading(true); setAllError(null);
    try {
      const s = await loadSession(); if(!s){setAllError("请先登录");return;}
      const res = await fetchGrade(s);
      setAllGpa(res.gpa); setAllCredits(res.totalCredits); await writeCache(k,res);
    } catch(e){setAllError(e instanceof Error?e.message:"获取全部绩点失败");}
    finally{setAllLoading(false);}
  },[]);

  const loadExams = useCallback(async (force=false) => {
    const u = await AsyncStorage.getItem("username");
    if (!u) { setExamError("请先登录"); setExamLoading(false); return; }
    const k = cacheKey("exams", u);
    if (!force) {
      const c = await readCache<ExamInfo[]>(k);
      if (c) {
        setExams(c); setExamLoading(false); setExamError(null); setExamStale(true);
        try { const s=await loadSession(); if(s){const r=await fetchExams(s);setExams(r);await writeCache(k,r);} } catch{}
        finally{setExamStale(false);}
        return;
      }
    }
    setExamLoading(true); setExamError(null);
    try {
      const s = await loadSession(); if(!s){setExamError("请先登录");return;}
      const res = await fetchExams(s); setExams(res); await writeCache(k,res);
    } catch(e){
      writeLog("ACADEMIC",`考试加载失败: ${e instanceof Error?e.message:String(e)}`,"error");
      setExamError(e instanceof Error?e.message:"获取考试信息失败");
    } finally{setExamLoading(false);}
  },[]);

  const loadHw = useCallback(async (force=false) => {
    const u = await AsyncStorage.getItem("username");
    if (!u) { setHomeworkError("请先登录"); setHomeworkLoading(false); return; }
    const k = cacheKey("homeworks", u);
    if (!force) {
      const c = await readCache<HomeworkInfo[]>(k);
      if (c) {
        setHomeworks(c); setHomeworkLoading(false); setHomeworkError(null); setHomeworkStale(true);
        try { const s=await loadSession(); if(s){const r=await fetchHomeworks(s);setHomeworks(r);await writeCache(k,r);} } catch{}
        finally{setHomeworkStale(false);}
        return;
      }
    }
    setHomeworkLoading(true); setHomeworkError(null);
    try {
      const s = await loadSession(); if(!s){setHomeworkError("请先登录");return;}
      const res = await fetchHomeworks(s);
      writeLog("ACADEMIC",`作业: ${res.length} 项`,res.length===0?"warn":"info");
      setHomeworks(res); await writeCache(k,res);
    } catch(e){
      writeLog("ACADEMIC",`作业加载失败: ${e instanceof Error?e.message:String(e)}`,"error");
      setHomeworkError(e instanceof Error?e.message:"获取作业失败");
    } finally{setHomeworkLoading(false);}
  },[]);

  const onRefresh = useCallback(async()=>{
    setRefreshing(true);
    await Promise.all([loadMajor(true),loadAll(true),loadExams(true),loadHw(true)]);
    setRefreshing(false);
  },[loadMajor,loadAll,loadExams,loadHw]);

  useEffect(()=>{
    if(authState.userToken){ loadMajor(); loadAll(); loadExams(); loadHw(); }
  },[authState.userToken]);

  useEffect(()=>{
    AsyncStorage.getItem(GPA_KEY).then(v=>{if(v==="1")setGpaHidden(true);}).catch(()=>{});
  },[]);

  const toggleHidden = useCallback(async()=>{
    const next = !gpaHidden; setGpaHidden(next);
    await AsyncStorage.setItem(GPA_KEY,next?"1":"0").catch(()=>{});
  },[gpaHidden]);

  // ─────────────────────────────────────────────────────────────────────────

  if (!authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-background">
        <View style={{flex:1,justifyContent:"center",alignItems:"center",padding:24}}>
          <Text style={{fontSize:15,color:colors.muted,textAlign:"center"}}>
            请先在首页登录浙大统一身份认证
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // exam grouping
  const examMap  = groupExams(exams);
  const current: typeof Array.prototype[0][] = [];
  const past:    typeof Array.prototype[0][] = [];
  for (const g of examMap.values()) {
    const today = new Date(); today.setHours(0,0,0,0);
    if (g.endDate < today) past.push(g); else current.push(g);
  }
  current.sort((a,b)=>b.displayName.localeCompare(a.displayName));
  past.sort((a,b)=>b.displayName.localeCompare(a.displayName));

  const totalExams   = current.reduce((s,g)=>s+g.exams.length,0);
  const pastTotal    = past.reduce((s,g)=>s+g.exams.length,0);
  const pendingHw    = homeworks.filter(h=>!h.submitted&&!hwPast(h.deadlineIso)).length;
  const todayHw      = homeworks.filter(h=>!h.submitted&&hwToday(h.deadlineIso)).length;

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{flexGrow:1}}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary}/>}
      >
        <View style={{flex:1,gap:20,padding:20}}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <View style={{alignItems:"center",paddingTop:4,gap:10}}>
            <Text style={{fontSize:26,fontWeight:"700",color:colors.foreground,letterSpacing:-0.5}}>
              学业
            </Text>
            {/* quick status pills */}
            {(pendingHw>0||todayHw>0||totalExams>0) && (
              <View style={{flexDirection:"row",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                {pendingHw>0 && (
                  <Pill label={`${pendingHw} 项作业待交`} color={HW_ACCENT} bg={rgba(HW_ACCENT,0.1)}/>
                )}
                {todayHw>0 && (
                  <Pill label={`今日 ${todayHw} 项截止`} color={colors.error} bg={rgba(colors.error,0.1)}/>
                )}
                {totalExams>0 && (
                  <Pill label={`${totalExams} 场考试`} color={colors.primary} bg={rgba(colors.primary,0.1)}/>
                )}
              </View>
            )}
          </View>

          {/* ── GPA ──────────────────────────────────────────────────────── */}
          <GpaCard
            majorGpa={majorGpa} majorCredits={majorCredits}
            majorLoading={majorLoading} majorError={majorError} onRetryMajor={()=>loadMajor(true)}
            allGpa={allGpa} allCredits={allCredits}
            allLoading={allLoading} allError={allError} onRetryAll={()=>loadAll(true)}
            hidden={gpaHidden} onToggle={toggleHidden}
            onPress={()=>router.push("/grade-detail")}
            stale={majorStale||allStale} radius={r}
          />

          {/* ── Homework ─────────────────────────────────────────────────── */}
          <HomeworkSummaryCard
            homeworks={homeworks}
            loading={homeworkLoading}
            error={homeworkError}
            onRetry={()=>loadHw(true)}
            stale={homeworkStale}
            radius={r}
            onPress={()=>router.push("/homework-detail")}
          />

          {/* ── Exams ────────────────────────────────────────────────────── */}
          {examLoading ? (
            <View style={{backgroundColor:colors.background,borderRadius:r,padding:24,alignItems:"center"}}>
              <ActivityIndicator color={EXAM_ACCENT}/>
            </View>
          ) : examError ? (
            <View style={{
              borderRadius:r, backgroundColor:rgba(colors.error,0.07),
              borderWidth:0.5, borderColor:rgba(colors.error,0.25), padding:16, gap:10,
            }}>
              <Text style={{fontSize:13,color:colors.error}}>{examError}</Text>
              <TouchableOpacity onPress={()=>loadExams(true)} style={{
                alignSelf:"flex-start",paddingHorizontal:14,paddingVertical:7,
                borderRadius:8, backgroundColor:rgba(colors.error,0.1),
              }}>
                <Text style={{fontSize:13,fontWeight:"600",color:colors.error}}>重试</Text>
              </TouchableOpacity>
            </View>
          ) : exams.length===0 ? (
            <View style={{
              backgroundColor:colors.background, borderRadius:r,
              borderWidth:0.5, borderColor:colors.border,
              paddingVertical:20, alignItems:"center",
            }}>
              <Text style={{fontSize:13,color:colors.muted}}>暂无考试安排</Text>
            </View>
          ) : (
            <View style={{gap:20}}>
              {/* current */}
              {current.map(g=>(
                <ExamGroup key={g.key} group={g} isPast={false} radius={r}/>
              ))}

              {/* past collapsible */}
              {past.length>0 && (
                <View style={{gap:10}}>
                  <SectionLabel
                    title="已结束学期" badge={pastTotal}
                    action={{label:showPast?"收起":"展开",onPress:()=>setShowPast(v=>!v)}}
                  />
                  {showPast && (
                    <View style={{gap:14}}>
                      {past.map(g=>(
                        <View key={g.key} style={{gap:8,opacity:0.7}}>
                          <Text style={{fontSize:13,fontWeight:"500",color:PAST_COLOR}}>{g.displayName}</Text>
                          {g.exams.map((e:ExamInfo,i:number)=><ExamCard key={i} exam={e} isPast compact radius={r}/>)}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          <View style={{height:12}}/>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}