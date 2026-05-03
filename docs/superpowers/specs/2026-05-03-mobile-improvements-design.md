# Mobile Improvements Design Spec

Date: 2026-05-03
Status: Draft
Scope: Full mobile experience improvements for Android (Capacitor)

## Background

The IM app uses Vue 3 + Capacitor for mobile. Analysis revealed 20+ issues across 5 categories: missing Capacitor plugins, broken native lifecycle, no media optimization, zero Moments responsive CSS, and missing chat interaction patterns. This spec covers all improvements, decomposed into 5 independent parallel subtasks.

## Architecture Overview

5 independent subtasks, parallel after subtask A completes:

```
A (Capacitor Infrastructure) ──→ B, C, D, E can reference A's plugins
    │
B (Storage/Lifecycle)   C (Media/Files)   D (Moments)   E (Chat UX)
    └────── all independent ───────────────────────────────┘
```

Each subtask modifies non-overlapping file sets. Shared infrastructure (plugin installation) is handled by A; others consume it.

---

## Subtask A: Capacitor Infrastructure

**Goal**: Transform Capacitor from an empty shell into a functional native runtime.

### A1. Install Capacitor Plugins

Add to `package.json`:
- `@capacitor/keyboard` - native keyboard management
- `@capacitor/status-bar` - status bar control
- `@capacitor/app` - app lifecycle + hardware back button
- `@capacitor/splash-screen` - splash screen
- `@capacitor/network` - network status detection
- `@capacitor/preferences` - native storage
- `@capacitor/haptics` - haptic feedback
- `@capacitor/camera` - camera/gallery
- `@capacitor/filesystem` - file system access
- `@capacitor/push-notifications` - push notifications

### A2. Update `capacitor.config.ts`

```typescript
const config: CapacitorConfig = {
  appId: 'com.myhzz.newim',
  appName: 'NewIM',
  webDir: 'dist',
  androidScheme: 'https',
  android: {
    backgroundColor: '#1a1a2e',
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
  },
};
```

### A3. Update `AndroidManifest.xml`

Add permissions:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

### A4. Fix `index.html` Viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#1a1a2e" />
```

### A5. Clean Up Dead Code

- Remove `src/services/platform/native-runtime.ts` (move `isNativeRuntime()` to a unified platform utility)
- Remove `src/composables/useSafeArea.ts` (unused)
- Remove unused `vue-virtual-scroller` CSS import from `main.ts` (will be properly imported in subtask E)

### Verification

- `npx cap sync` succeeds
- Android build has no permission warnings
- iPhone notch safe-area padding works (viewport-fit=cover)

---

## Subtask B: Native Storage & Lifecycle

**Goal**: Make the app reliable in native environments - no data loss, no battery drain.

### B1. Implement `NativeStorageService`

File: `src/services/storage/native-storage.service.ts`

- Implement `StorageService` interface using `@capacitor/preferences`
- Methods: `get(key)`, `set(key, value)`, `remove(key)`, `clear()`, `keys()`
- JSON serialization for non-string values

File: `src/services/storage/storage.service.ts`

- Add factory function: `createStorageService()` returns `NativeStorageService` when `Capacitor.isNativePlatform()`, else `WebStorageService`
- Export singleton that auto-selects the right implementation
- All existing consumers unchanged (same interface)

### B2. Fix HeartbeatService

File: `src/services/heartbeat.ts`

- Import `appLifecycleService`
- On `onBackground`: call `stop()` to clear all intervals
- On `onForeground`: call `start()` to resume heartbeats
- Add `isRunning` state to prevent double-start

### B3. Upgrade `app-lifecycle.service.ts`

File: `src/services/platform/app-lifecycle.service.ts`

```
if (Capacitor.isNativePlatform()) {
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onForeground();
    else onBackground();
  });
} else {
  document.addEventListener('visibilitychange', ...);
}
```

### B4. Upgrade `network-status.service.ts`

File: `src/services/platform/network-status.service.ts`

```
if (Capacitor.isNativePlatform()) {
  Network.addListener('networkStatusChange', (status) => {
    if (status.connected) onOnline();
    else onOffline();
  });
} else {
  window.addEventListener('online', ...);
  window.addEventListener('offline', ...);
}
```

### B5. Offline Message Queue Persistence

File: `src/utils/message-send-queue.ts` (or equivalent)

- Add IndexedDB table `pending_messages` in `im_message_repo`
- On send failure (network error): persist message to IndexedDB with status `pending`
- On network restore or foreground: read pending messages and retry
- On successful send: remove from pending queue
- Show pending messages in UI with "sending..." indicator

### B6. Hardware Back Button Handling

File: `src/layouts/MobileChatLayout.vue`

```
import { App } from '@capacitor/app';

App.addListener('backButton', ({ canGoBack }) => {
  if (activeSession.value) {
    activeSession.value = null; // close chat room, back to list
  } else if (drawerVisible) {
    closeDrawer();
  } else {
    App.exitApp(); // or double-tap-to-exit logic
  }
});
```

### Verification

- App goes to background for 30s → heartbeat stops, resumes on foreground
- Storage data survives app restart (Preferences)
- Send message while offline → message persisted → reconnect → auto-send
- Android back button: close chat room → close drawer → exit app

---

## Subtask C: Media & File Capabilities

**Goal**: Mobile media experience at native app level.

### C1. Camera/Gallery Integration

File: `src/services/camera.service.ts`

```
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

async function takePhoto(): Promise<Photo> {
  return Camera.getPhoto({
    quality: 80,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
  });
}

async function pickFromGallery(): Promise<Photo> {
  return Camera.getPhoto({
    quality: 80,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Photos,
  });
}
```

Replace `<input type="file">` in:
- `ChatComposer.vue` - image/file sending
- `Profile.vue` - avatar upload
- `Groups.vue` - group avatar upload
- `useMomentsComposer.ts` - moments media

Show native Action Sheet: "拍照" / "从相册选择" / "取消"

### C2. Client-Side Image Compression

File: `src/utils/image-compression.ts`

```
async function compressImage(file: File, maxWidth = 2048, quality = 0.8): Promise<Blob> {
  // Create Image element
  // Calculate scaled dimensions (max 2048px on longest side)
  // Draw to Canvas
  // canvas.toBlob('image/jpeg', quality)
  // Return if < 1MB, otherwise reduce quality and retry
}
```

Integration points:
- `useFileMessageUpload.ts`: compress before upload
- `useMomentsComposer.ts`: compress before upload
- Avatar upload flows: compress before upload

### C3. Full-Screen Image Viewer

File: `src/components/common/ImageViewer.vue`

Features:
- Full-screen overlay, black background, z-index 9999
- Image centered with `object-fit: contain`
- Pinch-to-zoom: track two-finger touch events, adjust CSS `transform: scale()`
- Swipe left/right: switch between images in the array
- Swipe down: dismiss (translate Y > threshold → close, else snap back)
- Close button in top-right corner
- Image counter: "3 / 9" in top-center

Replace `window.open()` in `ChatMessageList.vue` line 648.

### C4. File Download Optimization

File: `src/services/download.service.ts`

```
async function downloadFile(url: string, filename: string) {
  if (Capacitor.isNativePlatform()) {
    // Fetch blob → Filesystem.writeFile() → Filesystem.open() or Share.share()
  } else {
    // Create <a> element fallback
  }
}
```

Replace `downloadFile` in `ChatMessageList.vue` lines 651-668.

### C5. Voice Recording Upgrade

File: `src/features/chat/composables/useVoiceRecorder.ts`

- Remove `isSecureContext` check when `Capacitor.isNativePlatform()` (always secure)
- Keep `MediaRecorder` as primary (works well in Capacitor WebView)
- No plugin change needed unless quality issues reported

### Verification

- Click image button → native Action Sheet "拍照/相册/取消"
- Take photo → auto-compress → upload size < 1MB
- Click chat image → full-screen viewer with zoom/swipe/dismiss
- Download file → native download on Android
- Voice recording works without HTTPS check on native

---

## Subtask D: Moments Mobile Adaptation

**Goal**: Make Moments fully usable on phones.

### D1. `MomentsContainer.vue`

- Drawer width: `size="min(400px, 100vw)"`
- Add `@media (max-width: 768px)`: drawer becomes full-screen (`size="100vw"`)
- Add safe-area padding on all edges

### D2. `MomentsComposer.vue`

- Media preview grid: `grid-template-columns: repeat(auto-fill, minmax(80px, 1fr))`
- Breakpoints: 768px (tighter padding), 390px (even tighter)
- Textarea: `font-size: 16px` to prevent iOS zoom
- Action buttons full-width on small screens

### D3. `MomentsPostCard.vue`

- Image grids (`grid-1` to `grid-6`): reduce gaps and max dimensions on mobile
- Avatar: shrink to 36px
- Text: reduce font size
- Action bar: increase touch targets to 44px

### D4. `MomentsFeed.vue`

- Add `padding-bottom` for tab bar + safe area
- Loading indicator centered

### D5. `MomentsImageViewer.vue`

- Replace current fullscreen dialog with the `ImageViewer` component from subtask C
- If C not ready, add swipe gesture to existing dialog

### D6. `MomentsLikeBar.vue` / `MomentsComments.vue`

- Reduce spacing and font sizes on mobile
- Comment input: larger touch target, `font-size: 16px`

### D7. `MomentsVisibilityPicker.vue` / `MomentsNotifications.vue`

- Add `@media (max-width: 768px)` responsive rules

### D8. `LogMonitor.vue`

- Input widths: change from fixed `200px`/`150px` to `flex: 1; min-width: 120px`
- Layout: add `flex-wrap: wrap`
- Breakpoints: 768px (stack vertically), 390px (full-width everything)

### Verification

- 375px width: all Moments features functional
- Image grids aligned, no overflow
- Drawer full-screen on phone
- LogMonitor usable on mobile

---

## Subtask E: Chat Interaction Enhancements

**Goal**: Meet user expectations for mobile IM interaction patterns.

### E1. Virtual Scrolling

File: `src/features/chat/ChatMessageList.vue`

- Register `RecycleScroller` from `vue-virtual-scroller` in `main.ts`
- Replace `v-for` with `<RecycleScroller>` using dynamic item sizes
- Keep existing scroll-to-bottom, history-load-on-scroll-top logic
- `v-memo` on `ChatMessageItem` remains for additional optimization

### E2. Swipe Gestures

**Conversation list swipe actions**:
- Track `touchstart`/`touchmove`/`touchend` on session items
- Left swipe reveals action buttons (delete, pin, mute) with CSS `transform: translateX(-Npx)`
- Only one item swiped at a time (swipe another → previous auto-closes)

**Chat room swipe-to-go-back** (optional):
- Right swipe on `MobileChatRoom` triggers `back` event
- Threshold: horizontal displacement > 80px and > vertical displacement

### E3. Pull-to-Refresh

- Add pull indicator at top of message list
- On pull-down > 60px: show spinner, trigger history load
- On release: animate indicator back to hidden
- Prevent multiple concurrent refreshes

### E4. Context Menu → Action Sheet

File: `src/features/chat/ChatMessageList.vue`

- On mobile (`useIsMobile()`), replace the div-based context menu with a bottom Action Sheet
- Element Plus has no built-in Action Sheet; implement as a bottom-positioned overlay
- Options: 复制, 撤回 (own messages only), 删除, 转发
- Add CSS `:active` states for touch feedback
- Dismiss on tap outside or swipe down

### E5. Typing Indicator

Requires backend WebSocket protocol support:
- New event type: `{ type: "typing", conversationId, userId }`
- Frontend `ChatComposer`: on input, send typing event (debounced 2s)
- Frontend display: in `MobileChatHeader` or message list footer, show "对方正在输入..."
- Auto-hide after 3s of no typing events

### E6. Message Delivery Status Animations

- Sending: rotating spinner icon (CSS `animation: spin`)
- Delivered: single checkmark fade-in (CSS `opacity: 0 → 1, 0.3s`)
- Read: double checkmark, color transition from gray to blue (CSS `transition: color 0.3s`)

### Verification

- 50+ messages: scroll smooth, no jank
- Swipe left on conversation → action buttons appear
- Pull down on message list → loading spinner → history loads
- Long-press message → bottom Action Sheet
- Typing indicator shows/hides correctly (needs backend)
- Message status icons animate on state change

---

## Cross-Cutting Concerns

### Testing Strategy

Each subtask should include:
- Manual testing on Android device/emulator
- TypeScript compilation check (`npx tsc --noEmit`)
- No new ESLint warnings

### File Overlap Matrix

| File | Subtask |
|------|---------|
| `package.json` | A |
| `capacitor.config.ts` | A |
| `AndroidManifest.xml` | A |
| `index.html` | A |
| `main.ts` | A, E |
| `native-runtime.ts` | A (delete) |
| `useSafeArea.ts` | A (delete) |
| `storage.service.ts` | B |
| `native-storage.service.ts` | B (new) |
| `heartbeat.ts` | B |
| `app-lifecycle.service.ts` | B |
| `network-status.service.ts` | B |
| `message-send-queue.ts` | B |
| `MobileChatLayout.vue` | B |
| `camera.service.ts` | C (new) |
| `image-compression.ts` | C (new) |
| `ImageViewer.vue` | C (new) |
| `download.service.ts` | C (new) |
| `ChatComposer.vue` | C, E |
| `ChatMessageList.vue` | C, E |
| `useFileMessageUpload.ts` | C |
| `useVoiceRecorder.ts` | C |
| `Profile.vue` | C |
| `Groups.vue` | C |
| `MomentsContainer.vue` | D |
| `MomentsComposer.vue` | D |
| `MomentsPostCard.vue` | D |
| `MomentsFeed.vue` | D |
| `MomentsImageViewer.vue` | D |
| `MomentsLikeBar.vue` | D |
| `MomentsComments.vue` | D |
| `MomentsVisibilityPicker.vue` | D |
| `MomentsNotifications.vue` | D |
| `LogMonitor.vue` | D |
| `MobileChatRoom.vue` | E |

Files with overlap (C and E both touch `ChatComposer.vue` and `ChatMessageList.vue`): these should be coordinated. Subtask C modifies media/upload logic; subtask E modifies scroll/gesture/context-menu logic. Different sections of the same file.
