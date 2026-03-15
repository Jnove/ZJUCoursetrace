# ZJU 课表

A Zhejiang University course schedule app for iOS, Android, and Web.

## Features

- **Home screen** — shows today's courses at a glance, with time, room, and teacher
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
│   │   ├── index.tsx        # Home (today's courses + login form)
│   │   ├── schedule.tsx     # Timetable screen
│   │   └── settings.tsx     # Theme + logout
│   └── courseDetailContent.tsx
│
├── components/
│   └── schedule-table.tsx   # Grid and list timetable renderer
│
├── lib/
│   ├── auth-context.tsx     # Login/logout state
│   ├── schedule-context.tsx # Course fetching and caching
│   └── semester-utils.ts    # Current semester/week calculation
│
├── server/
|   ├── _core/zju-service.ts # Puppeteer login + HTML scraper
|   └── api-routes.ts        # REST API endpoints
|
├── assets/                  # images
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
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 //or your own local ip
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
- **Active semesters load slowly** — the semester picker populates in the background after login; it may appear empty for 30 seconds on first use
- **Semester detection gaps** — dates that fall between semesters (e.g. exam weeks, holidays) return null and show no data on the home screen
