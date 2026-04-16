// Fallback for using MaterialIcons on Android and web.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Partial<Record<SymbolViewProps["name"], ComponentProps<typeof MaterialCommunityIcons>["name"] | string>>;
type IconSymbolName = keyof typeof MAPPING;


const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "gearshape.2.fill": "cog",
  "circle.righthalf.fill": "theme-light-dark",
  "sun.max": "white-balance-sunny",
  "moon.fill": "moon-waning-crescent",
  "rectangle.portrait.and.arrow.right": "logout",
  "person.fill": "account",
  "location.fill": "map-marker",
  "clock.fill": "clock",
  "pencil": "pencil",
  "list.bullet": "format-list-bulleted",
  "square.grid.2x2": "view-grid",
  "square.and.arrow.down":"download",
  "eye": "eye",
  "eye.slash": "eye-off",
  "chevron.left": "chevron-left",
  "sun.max.fill":        "weather-sunny",
  "cloud.sun.fill":      "weather-partly-cloudy",
  "cloud.fill":          "weather-cloudy",
  "cloud.fog.fill":      "weather-fog",
  "cloud.drizzle.fill":  "weather-hail",
  "cloud.rain.fill":     "weather-rainy",
  "cloud.snow.fill":     "weather-snowy",
  "cloud.bolt.fill":     "weather-lightning",
  "drop.fill":           "water",
  "square.and.arrow.up": "upload",
  "arrowshape.turn.up.right":"share",

  "graduationcap.fill":                    "school",
  "medal.fill":                            "medal",
  "chart.bar.fill":                        "chart-bar",
  "star.fill":                             "star",

  // Calendar
  "calendar":                              "calendar-month",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const iconName = (MAPPING[name] ?? "help-outline") as ComponentProps<typeof MaterialCommunityIcons>["name"];
  return <MaterialCommunityIcons color={color} size={size} name={iconName} style={style} />;
}