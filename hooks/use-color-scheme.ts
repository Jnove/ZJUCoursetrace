import { useTheme } from "@/lib/theme-provider";

export function useColorScheme() {
  return useTheme().resolvedTheme;
}
