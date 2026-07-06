/**
 * 装饰性小插画（react-native-svg 手绘）。
 * 单色字体图标在"假期/放假"这类情绪化场景太干瘪，这里用多色矢量小插画。
 * 主体色跟随主题主色，点缀色为固定的节日色（装饰用途，类似课程调色板，不走语义 token）。
 */

import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

import { useTheme } from "@/lib/theme-provider";

/** 沙滩伞 + 太阳：首页假期卡 */
export function VacationIllustration({ size = 56 }: { size?: number }) {
  const { primaryColor } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* 太阳 */}
      <Circle cx={51} cy={12} r={6} fill="#FBBF24" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
        <Line
          key={deg}
          x1={51} y1={2.5} x2={51} y2={5.5}
          stroke="#FBBF24" strokeWidth={1.8} strokeLinecap="round"
          origin="51,12" rotation={deg}
        />
      ))}

      {/* 沙滩 */}
      <Ellipse cx={30} cy={56} rx={27} ry={6} fill="#FCD34D" opacity={0.45} />

      {/* 伞（整体左倾） */}
      <G rotation={-16} origin="26,26">
        {/* 伞杆 */}
        <Rect x={24.9} y={25} width={2.2} height={30} rx={1.1} fill="#B45309" />
        {/* 伞面 */}
        <Path d="M4 27 A22 22 0 0 1 48 27 Z" fill={primaryColor} />
        {/* 伞面浅色条纹 */}
        <Path d="M13 27 A13 21 0 0 1 39 27 Z" fill="#fff" opacity={0.3} />
        <Path d="M21 27 A5 20 0 0 1 31 27 Z" fill={primaryColor} />
        {/* 伞顶小球 */}
        <Circle cx={26} cy={4.5} r={2.2} fill="#B45309" />
      </G>
    </Svg>
  );
}

/** 拉炮 + 彩带：日历假期"放假，好好休息" */
export function CelebrationIllustration({ size = 44 }: { size?: number }) {
  const { primaryColor } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* 炮筒（斜向右上开口） */}
      <G rotation={0}>
        <Path d="M10 54 L27 26 L40 39 Z" fill={primaryColor} />
        {/* 炮筒条纹（沿两条侧边按比例取点，保证落在锥体内） */}
        <Path d="M17.65 41.4 L20.2 37.2 L28 45 L23.5 47.25 Z" fill="#fff" opacity={0.35} />
        <Path d="M23.6 31.6 L25.3 28.8 L37 40.5 L34 42 Z" fill="#fff" opacity={0.35} />
        {/* 炮口高光 */}
        <Line x1={27} y1={26} x2={40} y2={39} stroke="#fff" strokeWidth={2} opacity={0.5} strokeLinecap="round" />
      </G>

      {/* 彩带（曲线） */}
      <Path d="M36 26 C 40 16, 48 18, 50 10" stroke="#F59E0B" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M44 34 C 52 32, 52 24, 60 24" stroke="#22C55E" strokeWidth={2.4} fill="none" strokeLinecap="round" />

      {/* 彩屑 */}
      <Circle cx={33} cy={14} r={2.4} fill="#EF4444" />
      <Circle cx={56} cy={34} r={2.2} fill="#3B82F6" />
      <Rect x={44} y={14} width={4.4} height={4.4} rx={1} fill="#A855F7" rotation={20} origin="46.2,16.2" />
      <Rect x={52} y={44} width={4} height={4} rx={1} fill="#F59E0B" rotation={-15} origin="54,46" />
      <Circle cx={24} cy={20} r={1.8} fill="#22C55E" />
    </Svg>
  );
}
