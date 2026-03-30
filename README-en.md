# ZJU课迹 （ZJUCousrsetrace）

<p align="center">
  <br><a href="README.md">中文</a> | English
</p>

[![License](https://img.shields.io/github/license/Jnove/ZJUCoursetrace?style=flat-square)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Jnove/ZJUCoursetrace?style=flat-square&label=release)](https://github.com/Jnove/ZJUCoursetrace/releases/latest)
[![Download APK](https://img.shields.io/github/downloads/Jnove/ZJUCoursetrace/total?style=flat-square&label=APK%20downloads&color=brightgreen&logo=android)](https://github.com/Jnove/ZJUCoursetrace/releases/latest)



A Zhejiang University course schedule app for iOS, Android, and Web.

## Statement
During the development process, Manus was used to generate the project architecture (although it didn't do a very good job), and in the subsequent code improvements, AI like Claude also provided "support".

## Tech Stack

**Frontend / Client**

- [Expo](https://expo.dev) + [React Native](https://reactnative.dev) — cross-platform framework targeting iOS, Android, and Web from a single codebase
- [Expo Router](https://expo.github.io/router) — file-system based routing
- [expo-location](https://docs.expo.dev/versions/latest/sdk/location/) — device location with GPS cache and graceful fallback for non-GMS devices
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) — persistent course status notification
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) — local schedule caching
- TypeScript — full type safety across the project

**Backend / Server**

- [Node.js](https://nodejs.org) + [Express](https://expressjs.com) — REST API server
- [Puppeteer](https://pptr.dev) — headless browser that handles ZJU SSO login and scrapes course HTML

**External APIs**

- [Open-Meteo](https://open-meteo.com) — open-source weather forecast; returns daily temperature range and precipitation probability by coordinates
- [今日诗词 (jinrishici)](https://www.jinrishici.com) — random classical Chinese poetry
- [httpbin.org](https://httpbin.org/ip) + [api.iping.cc](https://api.iping.cc) — IP-based geolocation fallback when no GPS cache is available

## Features

- **Home screen** — today's courses at a glance with time, room, and teacher; shows the ongoing course with a live countdown progress bar
- **Daily poem** — a random line of classical poetry on the home screen, refreshed each launch
- **Live weather** — auto-locates via GPS cache → IP fallback; shows temperature range, rain probability, and a contextual tip; switches to tomorrow's forecast after 9 PM
- **Persistent course notification** — Android status bar shows the current or next course with a live countdown; silent and non-intrusive
- **Timetable** — weekly grid view and daily list view, switchable with one tap
- **Week navigation** — step through weeks with prev/next buttons; odd/even week label shown
- **Semester picker** — dropdown to switch between all semesters that have courses
- **Course detail** — tap any course block to see full info (teacher, room, week type, exam info) in a modal
- **Dark / Light / System theme** — toggle in Settings
- **Offline support** — schedules are cached locally and load instantly on reopen

## Project Structure

```
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx              # Home (today's courses + poem + weather + login form)
│   │   ├── schedule.tsx           # Timetable screen
│   │   └── settings.tsx           # Theme + logout
│   └── courseDetailContent.tsx
│
├── components/
│   └── schedule-table.tsx         # Grid and list timetable renderer
│
├── lib/
│   ├── auth-context.tsx           # Login/logout state
│   ├── schedule-context.tsx       # Course fetching and caching
│   ├── semester-utils.ts          # Current semester/week calculation
│   └── course-notification.ts     # Persistent course notification manager
│
├── server/
│   ├── _core/zju-service.ts       # Puppeteer login + HTML scraper
│   └── api-routes.ts              # REST API endpoints
│
├── assets/                        # Images
```

## Get Started

**Dependencies**

- Node.js 18+
- pnpm 9+
- Chromium / Chrome (Puppeteer downloads one automatically if none is found)

**Install & run**

```bash
pnpm install
pnpm dev        # starts API server (port 3000) + Expo (port 8081)
```

Open [http://localhost:8081](http://localhost:8081) in a browser, or scan the QR code with Expo Go.

**Environment variables** — create a `.env` file:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000  # or your local network IP
```

**Build APK (Android)**

Requires an [Expo](https://expo.dev) account and the EAS CLI:

```bash
npm install -g eas-cli
eas login
```

Then build:

```bash
# Preview APK (recommended for testing)
eas build --platform android --profile preview

# Production APK
eas build --platform android --profile production
```

The APK download link will appear in your terminal and on the Expo dashboard once the build completes.

## Known Issues

- **Single user only** — the backend holds one shared Puppeteer browser session, so only one account can be logged in per server instance at a time
- **No persistence across restarts** — the server cache is in-memory; restarting the server clears all cached schedules and requires logging in again
- **Active semesters load slowly** — the semester picker populates in the background after login; it may appear empty for ~30 seconds on first use
- **Semester detection gaps** — dates that fall between semesters (e.g. exam weeks, holidays) return null and show no data on the home screen
- **Slow GPS on non-GMS Android** — devices without Google Play Services (some Chinese OEM phones) have slow GPS cold-start; the app automatically falls back to IP-based location on first launch
- **No persistent notification on iOS** — system limitation; course notifications on iOS can be dismissed by the user
