/** @type {const} */
const themeColors = {
  primary: { light: '#0a7ea4', dark: '#0a7ea4' },
  background: { light: '#ffffff', dark: '#34373a' },
  surface: { light: '#f5f5f5', dark: '#1e2022' },
  foreground: { light: '#11181C', dark: '#ECEDEE' },
  muted: { light: '#687076', dark: '#9BA1A6' },
  border: { light: '#E5E7EB', dark: '#334155' },
  success: { light: '#22C55E', dark: '#4ADE80' },
  warning: { light: '#F59E0B', dark: '#FBBF24' },
  error: { light: '#EF4444', dark: '#F87171' },
  // 语义强调色：浅色用深一档保证白底对比度，深色用亮一档保证黑底对比度
  violet: { light: '#7C3AED', dark: '#A78BFA' }, // 作业
  orange: { light: '#EA580C', dark: '#FB923C' }, // 考试 / 调休补班
};

module.exports = { themeColors };
