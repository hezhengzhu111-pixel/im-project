# Mobile Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Capacitor mobile app from a web-wrapper with missing native capabilities into a fully-functional native IM experience on Android.

**Architecture:** 5 independent subtasks. Task A (Capacitor Infrastructure) must complete first to install plugins. Tasks B/C/D/E can then run in parallel. Each task modifies non-overlapping file sets.

**Tech Stack:** Vue 3, TypeScript, Capacitor 8, Element Plus, Pinia, SCSS

---

## File Structure Overview

### New Files
| File | Subtask | Purpose |
|------|---------|---------|
| `src/services/platform/capacitor-init.ts` | A | Plugin initialization on app start |
| `src/services/storage/native-storage.service.ts` | B | Capacitor Preferences storage |
| `src/services/camera.service.ts` | C | Camera/gallery wrapper |
| `src/utils/image-compression.ts` | C | Client-side image compression |
| `src/components/common/ImageViewer.vue` | C | Full-screen image viewer |
| `src/services/download.service.ts` | C | Native file download |
| `src/components/common/ActionSheet.vue` | E | Bottom action sheet for mobile |

### Modified Files
| File | Subtask | Changes |
|------|---------|---------|
| `package.json` | A | Add 10 Capacitor plugins |
| `capacitor.config.ts` | A | Android config, plugins config |
| `android/app/src/main/AndroidManifest.xml` | A | Add permissions |
| `index.html` | A | viewport-fit=cover, theme-color |
| `src/main.ts` | A, E | Register vue-virtual-scroller, init Capacitor |
| `src/services/platform/native-runtime.ts` | A | Keep as-is (used by B/C) |
| `src/services/platform/app-lifecycle.service.ts` | B | Add Capacitor App listener |
| `src/services/platform/network-status.service.ts` | B | Add Capacitor Network listener |
| `src/services/storage/storage.service.ts` | B | Factory function |
| `src/services/heartbeat.ts` | B | Pause/resume on background/foreground |
| `src/layouts/MobileChatLayout.vue` | B | Back button handler |
| `src/features/chat/composables/useFileMessageUpload.ts` | C | Add compression |
| `src/features/chat/composables/useVoiceRecorder.ts` | C | Skip HTTPS check on native |
| `src/features/chat/ChatMessageList.vue` | C, E | Image viewer, download, action sheet, virtual scroll |
| `src/features/chat/ChatComposer.vue` | C | Camera integration |
| `src/pages/Profile.vue` | C | Camera for avatar |
| `src/pages/Groups.vue` | C | Camera for avatar |
| `src/features/moments/MomentsContainer.vue` | D | Full-screen drawer |
| `src/features/moments/MomentsComposer.vue` | D | Responsive grid |
| `src/features/moments/MomentsPostCard.vue` | D | Mobile image grid |
| `src/features/moments/MomentsFeed.vue` | D | Safe-area padding |
| `src/features/moments/dialogs/MomentsImageViewer.vue` | D | Use ImageViewer component |
| `src/features/moments/MomentsLikeBar.vue` | D | Mobile spacing |
| `src/features/moments/MomentsComments.vue` | D | Mobile spacing |
| `src/pages/LogMonitor.vue` | D | Responsive layout |
| `src/composables/useSafeArea.ts` | A | Delete (unused) |
| `src/components/mobile/MobileConversationList.vue` | E | Swipe actions |

---

## Task 1: Install Capacitor Plugins

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install all Capacitor plugins**

```bash
cd D:/project/new-im-project/frontend && npm install @capacitor/keyboard @capacitor/status-bar @capacitor/app @capacitor/splash-screen @capacitor/network @capacitor/preferences @capacitor/haptics @capacitor/camera @capacitor/filesystem @capacitor/push-notifications
```

Expected: All 10 packages added to `dependencies` in `package.json`. No errors.

- [ ] **Step 2: Verify installation**

```bash
cd D:/project/new-im-project/frontend && npm ls @capacitor/keyboard @capacitor/status-bar @capacitor/app @capacitor/splash-screen @capacitor/network @capacitor/preferences @capacitor/haptics @capacitor/camera @capacitor/filesystem @capacitor/push-notifications
```

Expected: All packages listed with versions.

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/package.json frontend/package-lock.json && git commit -m "feat(mobile): install 10 Capacitor plugins"
```

---

## Task 2: Update Capacitor Config

**Files:**
- Modify: `frontend/capacitor.config.ts`

- [ ] **Step 1: Replace capacitor.config.ts**

Replace the entire file with:

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.myhzz.newim",
  appName: "NewIM",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#0f172a",
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f172a",
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
  },
};

export default config;
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project && git add frontend/capacitor.config.ts && git commit -m "feat(mobile): configure Capacitor plugins and Android settings"
```

---

## Task 3: Update Android Manifest Permissions

**Files:**
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add permissions**

Replace the `<!-- Permissions -->` section at the bottom of the manifest. The full file should be:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
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
</manifest>
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project && git add frontend/android/app/src/main/AndroidManifest.xml && git commit -m "feat(mobile): add Android permissions for camera, mic, notifications, network"
```

---

## Task 4: Fix Viewport and Clean Dead Code

**Files:**
- Modify: `frontend/index.html`
- Delete: `frontend/src/composables/useSafeArea.ts`
- Modify: `frontend/src/main.ts` (remove unused vue-virtual-scroller CSS import — will be re-added in Task 18)

- [ ] **Step 1: Fix index.html viewport**

Replace line 6 of `frontend/index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Add after the viewport meta tag:

```html
<meta name="theme-color" content="#0f172a" />
```

The full `<head>` section should be:

```html
<head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <title>IM聊天应用</title>
    <meta name="description" content="基于Vue3和Spring Cloud Alibaba的即时通讯应用" />
    <meta name="keywords" content="IM,聊天,即时通讯,Vue3,WebSocket" />
</head>
```

- [ ] **Step 2: Delete useSafeArea.ts**

```bash
rm D:/project/new-im-project/frontend/src/composables/useSafeArea.ts
```

Verify no imports reference it:

```bash
cd D:/project/new-im-project/frontend && grep -r "useSafeArea" src/ --include="*.ts" --include="*.vue"
```

Expected: No results.

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/index.html && git rm frontend/src/composables/useSafeArea.ts && git commit -m "feat(mobile): add viewport-fit=cover, theme-color; remove unused useSafeArea"
```

---

## Task 5: Create Capacitor Init Module

**Files:**
- Create: `frontend/src/services/platform/capacitor-init.ts`

- [ ] **Step 1: Create the init module**

```typescript
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";
import { logger } from "@/utils/logger";

let backButtonHandler: ((event: { canGoBack: boolean }) => void) | null = null;

export function setupBackButtonHandler(
  handler: (event: { canGoBack: boolean }) => void,
): void {
  backButtonHandler = handler;
}

export async function initCapacitorPlugins(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Status bar
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0f172a" });
  } catch (e) {
    logger.warn("capacitor: StatusBar setup failed", e);
  }

  try {
    // Splash screen — hide after app is ready
    await SplashScreen.hide();
  } catch (e) {
    logger.warn("capacitor: SplashScreen hide failed", e);
  }

  try {
    // Keyboard — hide accessory bar on iOS
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch (e) {
    // Android doesn't support this — ignore
  }

  try {
    // Hardware back button
    App.addListener("backButton", (event) => {
      if (backButtonHandler) {
        backButtonHandler(event);
      } else if (!event.canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    });
  } catch (e) {
    logger.warn("capacitor: Back button setup failed", e);
  }

  logger.info("capacitor: plugins initialized");
}
```

- [ ] **Step 2: Wire up in main.ts**

In `frontend/src/main.ts`, add the import and call after `app.mount()`:

```typescript
import { initCapacitorPlugins } from "@/services/platform/capacitor-init";
```

After `app.mount("#app");`, add:

```typescript
void initCapacitorPlugins();
```

The full `main.ts` should be:

```typescript
import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";

import "element-plus/theme-chalk/el-overlay.css";
import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-message-box.css";
import "@/styles/index.scss";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { logger } from "@/utils/logger";
import { initCapacitorPlugins } from "@/services/platform/capacitor-init";

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.config.errorHandler = (err, _vm, info) => {
  logger.error("global error", { err, info });
};

app.config.warnHandler = (msg, _vm, trace) => {
  logger.warn("global warning", { msg, trace });
};

app.mount("#app");

void initCapacitorPlugins();
```

- [ ] **Step 3: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/platform/capacitor-init.ts frontend/src/main.ts && git commit -m "feat(mobile): add Capacitor plugin initialization module"
```

---

## Task 6: Upgrade App Lifecycle Service

**Files:**
- Modify: `frontend/src/services/platform/app-lifecycle.service.ts`

- [ ] **Step 1: Replace app-lifecycle.service.ts**

Replace the entire file:

```typescript
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

type LifecycleCallback = () => void;

class AppLifecycleService {
  private foregroundCallbacks: Set<LifecycleCallback> = new Set();
  private backgroundCallbacks: Set<LifecycleCallback> = new Set();
  private isListening = false;
  private _isForeground = true;

  get isForeground(): boolean {
    return this._isForeground;
  }

  onForeground(callback: LifecycleCallback): () => void {
    this.foregroundCallbacks.add(callback);
    this.ensureListening();
    return () => this.foregroundCallbacks.delete(callback);
  }

  onBackground(callback: LifecycleCallback): () => void {
    this.backgroundCallbacks.add(callback);
    this.ensureListening();
    return () => this.backgroundCallbacks.delete(callback);
  }

  private ensureListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive === this._isForeground) return;
        this._isForeground = isActive;
        const callbacks = isActive
          ? this.foregroundCallbacks
          : this.backgroundCallbacks;
        callbacks.forEach((cb) => {
          try {
            cb();
          } catch {
            /* ignore */
          }
        });
      }).catch(() => {
        // fallback to visibilitychange if plugin fails
        this.setupBrowserListener();
      });
    } else {
      this.setupBrowserListener();
    }
  }

  private setupBrowserListener(): void {
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private handleVisibility = (): void => {
    const isVisible = !document.hidden;
    if (isVisible === this._isForeground) return;
    this._isForeground = isVisible;

    const callbacks = isVisible
      ? this.foregroundCallbacks
      : this.backgroundCallbacks;
    callbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  destroy(): void {
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.foregroundCallbacks.clear();
    this.backgroundCallbacks.clear();
    this.isListening = false;
  }
}

export const appLifecycleService = new AppLifecycleService();
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/platform/app-lifecycle.service.ts && git commit -m "feat(mobile): use Capacitor App plugin for lifecycle on native"
```

---

## Task 7: Upgrade Network Status Service

**Files:**
- Modify: `frontend/src/services/platform/network-status.service.ts`

- [ ] **Step 1: Replace network-status.service.ts**

Replace the entire file:

```typescript
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

type NetworkCallback = () => void;

class NetworkStatusService {
  private onlineCallbacks: Set<NetworkCallback> = new Set();
  private offlineCallbacks: Set<NetworkCallback> = new Set();
  private isListening = false;

  get isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  }

  onOnline(callback: NetworkCallback): () => void {
    this.onlineCallbacks.add(callback);
    this.ensureListening();
    return () => this.onlineCallbacks.delete(callback);
  }

  onOffline(callback: NetworkCallback): () => void {
    this.offlineCallbacks.add(callback);
    this.ensureListening();
    return () => this.offlineCallbacks.delete(callback);
  }

  private ensureListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    if (Capacitor.isNativePlatform()) {
      Network.addListener("networkStatusChange", (status) => {
        if (status.connected) {
          this.onlineCallbacks.forEach((cb) => {
            try {
              cb();
            } catch {
              /* ignore */
            }
          });
        } else {
          this.offlineCallbacks.forEach((cb) => {
            try {
              cb();
            } catch {
              /* ignore */
            }
          });
        }
      }).catch(() => {
        this.setupBrowserListener();
      });
    } else {
      this.setupBrowserListener();
    }
  }

  private setupBrowserListener(): void {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  private handleOnline = (): void => {
    this.onlineCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  private handleOffline = (): void => {
    this.offlineCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  destroy(): void {
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    this.onlineCallbacks.clear();
    this.offlineCallbacks.clear();
    this.isListening = false;
  }
}

export const networkStatusService = new NetworkStatusService();
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/platform/network-status.service.ts && git commit -m "feat(mobile): use Capacitor Network plugin on native"
```

---

## Task 8: Implement Native Storage Service

**Files:**
- Create: `frontend/src/services/storage/native-storage.service.ts`
- Modify: `frontend/src/services/storage/storage.service.ts`

- [ ] **Step 1: Create native-storage.service.ts**

```typescript
import { Preferences } from "@capacitor/preferences";
import type { StorageService } from "./storage.service";

export class NativeStorageService implements StorageService {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }

  async clear(): Promise<void> {
    await Preferences.clear();
  }
}
```

- [ ] **Step 2: Update storage.service.ts with factory**

Replace the entire file:

```typescript
import { Capacitor } from "@capacitor/core";

export interface StorageService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

class WebStorageService implements StorageService {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }
}

function createStorageService(): StorageService {
  if (Capacitor.isNativePlatform()) {
    const { NativeStorageService } = require("./native-storage.service");
    return new NativeStorageService();
  }
  return new WebStorageService();
}

export const storageService: StorageService = createStorageService();
```

- [ ] **Step 3: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/storage/native-storage.service.ts frontend/src/services/storage/storage.service.ts && git commit -m "feat(mobile): add NativeStorageService using Capacitor Preferences"
```

---

## Task 9: Fix Heartbeat Background Pause

**Files:**
- Modify: `frontend/src/services/heartbeat.ts`

- [ ] **Step 1: Add lifecycle integration to HeartbeatService**

In `frontend/src/services/heartbeat.ts`, add at the top of the file after existing imports:

```typescript
import { appLifecycleService } from "@/services/platform/app-lifecycle.service";
```

Add a new private field and lifecycle setup in the constructor. Replace the constructor with:

```typescript
  private foregroundUnsub: (() => void) | null = null;
  private backgroundUnsub: (() => void) | null = null;

  constructor() {
    void this.loadFriends();
    if (typeof window !== "undefined") {
      window.addEventListener(
        "onlineStatusChanged",
        this.handleOnlineStatusChanged as EventListener,
      );
    }
    this.foregroundUnsub = appLifecycleService.onForeground(() => {
      this.start();
    });
    this.backgroundUnsub = appLifecycleService.onBackground(() => {
      this.stop();
    });
  }
```

Add a `destroy()` method after `stop()`:

```typescript
  destroy() {
    this.stop();
    this.foregroundUnsub?.();
    this.backgroundUnsub?.();
    if (typeof window !== "undefined") {
      window.removeEventListener(
        "onlineStatusChanged",
        this.handleOnlineStatusChanged as EventListener,
      );
    }
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/heartbeat.ts && git commit -m "fix(mobile): pause heartbeat when app goes to background"
```

---

## Task 10: Add Back Button Handler to Mobile Layout

**Files:**
- Modify: `frontend/src/layouts/MobileChatLayout.vue`

- [ ] **Step 1: Add back button logic**

In `frontend/src/layouts/MobileChatLayout.vue`, add to the `<script setup>` section after the existing imports:

```typescript
import { onMounted, onUnmounted } from "vue";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { setupBackButtonHandler } from "@/services/platform/capacitor-init";
```

Add after the `handleMobileTabChange` function:

```typescript
onMounted(() => {
  if (Capacitor.isNativePlatform()) {
    setupBackButtonHandler(({ canGoBack }) => {
      if (currentSession.value) {
        chatStore.clearCurrentSession();
      } else if (showSessionInfoDrawer.value) {
        showSessionInfoDrawer.value = false;
      } else if (showCreateGroup.value) {
        showCreateGroup.value = false;
      } else if (showAddFriend.value) {
        showAddFriend.value = false;
      } else if (showSearchDialog.value) {
        showSearchDialog.value = false;
      } else if (showGroupReadDialog.value) {
        showGroupReadDialog.value = false;
      } else if (!canGoBack) {
        CapApp.exitApp();
      } else {
        window.history.back();
      }
    });
  }
});

onUnmounted(() => {
  if (Capacitor.isNativePlatform()) {
    setupBackButtonHandler(() => {});
  }
});
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/layouts/MobileChatLayout.vue && git commit -m "feat(mobile): handle Android hardware back button in mobile layout"
```

---

## Task 11: Create Camera Service

**Files:**
- Create: `frontend/src/services/camera.service.ts`

- [ ] **Step 1: Create camera.service.ts**

```typescript
import { Capacitor } from "@capacitor/core";
import {
  Camera,
  CameraResultType,
  CameraSource,
  type Photo,
} from "@capacitor/camera";

export interface CameraPhoto {
  base64: string;
  format: string;
}

export async function takePhoto(): Promise<CameraPhoto> {
  const photo: Photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
  });
  return {
    base64: photo.base64String ?? "",
    format: photo.format ?? "jpeg",
  };
}

export async function pickFromGallery(): Promise<CameraPhoto> {
  const photo: Photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Photos,
  });
  return {
    base64: photo.base64String ?? "",
    format: photo.format ?? "jpeg",
  };
}

export function isCameraAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export function base64ToFile(base64: string, format: string, filename?: string): File {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const name = filename ?? `photo_${Date.now()}.${format}`;
  return new File([byteArray], name, { type: mime });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/camera.service.ts && git commit -m "feat(mobile): add camera service with takePhoto and pickFromGallery"
```

---

## Task 12: Create Image Compression Utility

**Files:**
- Create: `frontend/src/utils/image-compression.ts`

- [ ] **Step 1: Create image-compression.ts**

```typescript
const MAX_DIMENSION = 2048;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const INITIAL_QUALITY = 0.8;
const MIN_QUALITY = 0.3;

export async function compressImage(
  file: File,
  maxDimension = MAX_DIMENSION,
  maxSize = MAX_FILE_SIZE,
): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxDimension,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxSize && quality > MIN_QUALITY) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }

  return blob;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }
  const ratio = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight,
  );
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      "image/jpeg",
      quality,
    );
  });
}

export function blobToFile(blob: Blob, filename?: string): File {
  const name = filename ?? `compressed_${Date.now()}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/utils/image-compression.ts && git commit -m "feat(mobile): add client-side image compression utility"
```

---

## Task 13: Create Full-Screen Image Viewer

**Files:**
- Create: `frontend/src/components/common/ImageViewer.vue`

- [ ] **Step 1: Create ImageViewer.vue**

```vue
<template>
  <Teleport to="body">
    <Transition name="viewer-fade">
      <div v-if="visible" class="image-viewer" @click.self="close">
        <!-- Close button -->
        <button class="viewer-close" @click="close" aria-label="关闭">
          <el-icon :size="24"><Close /></el-icon>
        </button>

        <!-- Counter -->
        <div v-if="images.length > 1" class="viewer-counter">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>

        <!-- Image -->
        <div
          ref="imageWrapRef"
          class="viewer-image-wrap"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
        >
          <img
            :src="images[currentIndex]"
            class="viewer-image"
            :style="imageTransform"
            draggable="false"
          />
        </div>

        <!-- Navigation arrows (desktop) -->
        <button
          v-if="images.length > 1 && currentIndex > 0"
          class="viewer-nav viewer-nav--prev"
          @click.stop="prev"
          aria-label="上一张"
        >
          <el-icon :size="32"><ArrowLeft /></el-icon>
        </button>
        <button
          v-if="images.length > 1 && currentIndex < images.length - 1"
          class="viewer-nav viewer-nav--next"
          @click.stop="next"
          aria-label="下一张"
        >
          <el-icon :size="32"><ArrowRight /></el-icon>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Close, ArrowLeft, ArrowRight } from "@element-plus/icons-vue";

const props = defineProps<{
  images: string[];
  initialIndex?: number;
}>();

const visible = defineModel<boolean>("visible", { default: false });
const currentIndex = ref(props.initialIndex ?? 0);

watch(visible, (val) => {
  if (val) {
    currentIndex.value = props.initialIndex ?? 0;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }
});

// Pinch-to-zoom state
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
let initialDistance = 0;
let initialScale = 1;
let startX = 0;
let startY = 0;
let startTranslateX = 0;
let startTranslateY = 0;
let isDragging = false;

const imageTransform = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
}));

function close() {
  visible.value = false;
}

function prev() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    resetTransform();
  }
}

function next() {
  if (currentIndex.value < props.images.length - 1) {
    currentIndex.value++;
    resetTransform();
  }
}

function resetTransform() {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
}

function getDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    initialDistance = getDistance(e.touches);
    initialScale = scale.value;
  } else if (e.touches.length === 1) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTranslateX = translateX.value;
    startTranslateY = translateY.value;
    isDragging = true;
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 2) {
    const dist = getDistance(e.touches);
    scale.value = Math.max(0.5, Math.min(5, initialScale * (dist / initialDistance)));
  } else if (e.touches.length === 1 && isDragging && scale.value > 1) {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    translateX.value = startTranslateX + dx;
    translateY.value = startTranslateY + dy;
  }
}

function onTouchEnd(e: TouchEvent) {
  if (e.touches.length === 0) {
    // Swipe detection (only when not zoomed)
    if (scale.value <= 1 && isDragging) {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) prev();
        else next();
      } else if (Math.abs(dy) > 100 && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        close();
      }
    }
    isDragging = false;
    // Snap back if scale < 1
    if (scale.value < 1) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
    }
  }
}

// Keyboard navigation
function onKeydown(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowLeft") prev();
  if (e.key === "ArrowRight") next();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", onKeydown);
}
</script>

<style scoped lang="scss">
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-close {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top, 0px));
  right: 12px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
}

.viewer-counter {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.viewer-image-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.viewer-image {
  max-width: 95vw;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  transition: transform 0.1s ease-out;
}

.viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
}

.viewer-nav--prev {
  left: 12px;
}

.viewer-nav--next {
  right: 12px;
}

.viewer-fade-enter-active,
.viewer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.viewer-fade-enter-from,
.viewer-fade-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/components/common/ImageViewer.vue && git commit -m "feat(mobile): add full-screen image viewer with zoom, swipe, dismiss"
```

---

## Task 14: Create Download Service

**Files:**
- Create: `frontend/src/services/download.service.ts`

- [ ] **Step 1: Create download.service.ts**

```typescript
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export async function downloadFile(url: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await downloadNative(url, filename);
  } else {
    downloadBrowser(url, filename);
  }
}

async function downloadNative(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: filename,
      url: result.uri,
    });
  } catch {
    // User cancelled share — that's ok
  }
}

function downloadBrowser(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/services/download.service.ts && git commit -m "feat(mobile): add native download service using Capacitor Filesystem"
```

---

## Task 15: Integrate Camera and Compression into Chat

**Files:**
- Modify: `frontend/src/features/chat/ChatComposer.vue`
- Modify: `frontend/src/features/chat/composables/useFileMessageUpload.ts`
- Modify: `frontend/src/features/chat/ChatMessageList.vue`

- [ ] **Step 1: Add compression to useFileMessageUpload.ts**

In `frontend/src/features/chat/composables/useFileMessageUpload.ts`, add at the top after existing imports:

```typescript
import { compressImage, blobToFile } from "@/utils/image-compression";
```

In the `upload` function, before the actual upload call, add compression for IMAGE type. Find the section where `file` is used and wrap the IMAGE path:

```typescript
// Before upload, compress images
let uploadFile = file;
if (kind === "IMAGE" && file.size > 1024 * 1024) {
  try {
    const compressed = await compressImage(file);
    uploadFile = blobToFile(compressed, file.name);
  } catch {
    // Compression failed — upload original
    uploadFile = file;
  }
}
```

Use `uploadFile` instead of `file` in the subsequent `fileService.uploadImage()` call.

- [ ] **Step 2: Add camera option to ChatComposer.vue**

In `frontend/src/features/chat/ChatComposer.vue`, add imports at the top of `<script setup>`:

```typescript
import { isCameraAvailable, takePhoto, pickFromGallery, base64ToFile } from "@/services/camera.service";
import { compressImage, blobToFile } from "@/utils/image-compression";
import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet";
import { Capacitor } from "@capacitor/core";
```

Replace the `openImagePicker` function (the one that triggers the hidden file input for images) with:

```typescript
async function openImagePicker() {
  if (isCameraAvailable()) {
    try {
      const result = await ActionSheet.showActions({
        title: "选择图片",
        options: [
          { title: "拍照" },
          { title: "从相册选择" },
        ],
      });
      if (result.index === 0) {
        const photo = await takePhoto();
        const file = base64ToFile(photo.base64, photo.format);
        const compressed = await compressImage(file);
        const finalFile = blobToFile(compressed, file.name);
        await emitUploadedMedia(finalFile, "IMAGE");
      } else if (result.index === 1) {
        const photo = await pickFromGallery();
        const file = base64ToFile(photo.base64, photo.format);
        const compressed = await compressImage(file);
        const finalFile = blobToFile(compressed, file.name);
        await emitUploadedMedia(finalFile, "IMAGE");
      }
    } catch {
      // Fallback to file input
      imageInputRef.value?.click();
    }
  } else {
    imageInputRef.value?.click();
  }
}
```

Note: `@capacitor/action-sheet` is a core plugin that comes with `@capacitor/core` — no additional install needed.

- [ ] **Step 3: Replace window.open with ImageViewer in ChatMessageList.vue**

In `frontend/src/features/chat/ChatMessageList.vue`, add the import:

```typescript
import ImageViewer from "@/components/common/ImageViewer.vue";
```

Add state refs:

```typescript
const viewerVisible = ref(false);
const viewerImages = ref<string[]>([]);
const viewerIndex = ref(0);
```

Replace the `previewImage` function:

```typescript
function previewImage(url: string) {
  const allImages = props.messages
    .filter((m) => m.type === "IMAGE" && m.mediaUrl)
    .map((m) => m.mediaUrl!);
  const idx = allImages.indexOf(url);
  viewerImages.value = allImages;
  viewerIndex.value = idx >= 0 ? idx : 0;
  viewerVisible.value = true;
}
```

Add the `ImageViewer` component to the template, after the context menu:

```html
<ImageViewer
  v-model:visible="viewerVisible"
  :images="viewerImages"
  :initial-index="viewerIndex"
/>
```

- [ ] **Step 4: Replace downloadFile with native service**

In `frontend/src/features/chat/ChatMessageList.vue`, replace the import and function:

```typescript
import { downloadFile } from "@/services/download.service";
```

Replace the `downloadFile` method in the script:

```typescript
function handleDownloadFile(url: string, name: string) {
  void downloadFile(url, name || "download");
}
```

Update the template to call `handleDownloadFile` instead of the old `downloadFile`.

- [ ] **Step 5: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/features/chat/ChatComposer.vue frontend/src/features/chat/composables/useFileMessageUpload.ts frontend/src/features/chat/ChatMessageList.vue && git commit -m "feat(mobile): integrate camera, compression, image viewer, native download in chat"
```

---

## Task 16: Integrate Camera into Profile and Groups

**Files:**
- Modify: `frontend/src/pages/Profile.vue`
- Modify: `frontend/src/pages/Groups.vue`

- [ ] **Step 1: Update Profile.vue avatar upload**

In `frontend/src/pages/Profile.vue`, add imports:

```typescript
import { isCameraAvailable, takePhoto, pickFromGallery, base64ToFile } from "@/services/camera.service";
import { compressImage, blobToFile } from "@/utils/image-compression";
import { ActionSheet } from "@capacitor/action-sheet";
```

Replace `handleAvatarSelect` to add camera option. Create a new `openAvatarPicker` that shows Action Sheet on native:

```typescript
async function openAvatarPicker() {
  if (isCameraAvailable()) {
    try {
      const result = await ActionSheet.showActions({
        title: "更换头像",
        options: [
          { title: "拍照" },
          { title: "从相册选择" },
        ],
      });
      if (result.index === 0) {
        const photo = await takePhoto();
        const file = base64ToFile(photo.base64, photo.format);
        const compressed = await compressImage(file);
        await uploadAvatar(blobToFile(compressed, file.name));
      } else if (result.index === 1) {
        const photo = await pickFromGallery();
        const file = base64ToFile(photo.base64, photo.format);
        const compressed = await compressImage(file);
        await uploadAvatar(blobToFile(compressed, file.name));
      }
    } catch {
      fileInputRef.value?.click();
    }
  } else {
    fileInputRef.value?.click();
  }
}

async function uploadAvatar(file: File) {
  const response = await fileService.uploadImage(file);
  if (response.code === 200) {
    await userService.updateProfile({ avatar: response.data.url });
    userStore.updateUserInfo({ avatar: response.data.url });
  }
}
```

- [ ] **Step 2: Update Groups.vue avatar upload**

Same pattern as Profile.vue — replace `openAvatarPicker` with Action Sheet on native, fallback to file input on web.

- [ ] **Step 3: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/pages/Profile.vue frontend/src/pages/Groups.vue && git commit -m "feat(mobile): add camera integration for avatar upload in profile and groups"
```

---

## Task 17: Fix Voice Recorder HTTPS Check

**Files:**
- Modify: `frontend/src/features/chat/composables/useVoiceRecorder.ts`

- [ ] **Step 1: Skip HTTPS check on native**

In `frontend/src/features/chat/composables/useVoiceRecorder.ts`, add import at top:

```typescript
import { Capacitor } from "@capacitor/core";
```

Find the `isRecordingContextSecure` check (around line 35-65) and add a native bypass:

```typescript
const isNative = Capacitor.isNativePlatform();
const isRecordingContextSecure =
  isNative || window.isSecureContext || location.hostname === "localhost";
```

This replaces the existing `isRecordingContextSecure` declaration. The rest of the logic remains unchanged.

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/features/chat/composables/useVoiceRecorder.ts && git commit -m "fix(mobile): skip HTTPS check for voice recording on native Capacitor"
```

---

## Task 18: Moments Mobile Responsive CSS

**Files:**
- Modify: `frontend/src/features/moments/MomentsContainer.vue`
- Modify: `frontend/src/features/moments/MomentsComposer.vue`
- Modify: `frontend/src/features/moments/MomentsPostCard.vue`
- Modify: `frontend/src/features/moments/MomentsFeed.vue`
- Modify: `frontend/src/features/moments/dialogs/MomentsImageViewer.vue`
- Modify: `frontend/src/features/moments/MomentsLikeBar.vue`
- Modify: `frontend/src/features/moments/MomentsComments.vue`
- Modify: `frontend/src/pages/LogMonitor.vue`

- [ ] **Step 1: Fix MomentsContainer.vue drawer**

In `frontend/src/features/moments/MomentsContainer.vue`, find the `el-drawer` and change the `size` prop:

```html
<el-drawer
  v-model="showComposer"
  title="发布动态"
  :size="drawerSize"
  direction="btt"
>
```

Add computed:

```typescript
import { computed } from "vue";
import { useIsMobile } from "@/composables/useIsMobile";

const { isMobile } = useIsMobile();
const drawerSize = computed(() => (isMobile.value ? "100vw" : "min(400px, 100vw)"));
```

- [ ] **Step 2: Fix MomentsComposer.vue grid**

In `frontend/src/features/moments/MomentsComposer.vue`, find the media preview grid style and replace with responsive version. Add to `<style scoped>`:

```scss
@media (max-width: 768px) {
  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 6px;
  }

  .composer-textarea {
    font-size: 16px;
  }

  .publish-btn {
    width: 100%;
  }
}

@media (max-width: 390px) {
  .composer-card {
    padding: 12px;
  }
}
```

- [ ] **Step 3: Fix MomentsPostCard.vue image grid**

In `frontend/src/features/moments/MomentsPostCard.vue`, add to `<style scoped>`:

```scss
@media (max-width: 768px) {
  .post-card {
    padding: 12px;
  }

  .post-avatar {
    width: 36px;
    height: 36px;
  }

  .post-nickname {
    font-size: 14px;
  }

  .post-content {
    font-size: 14px;
  }

  .image-grid {
    gap: 4px;
  }

  .image-grid.grid-2,
  .image-grid.grid-3 {
    max-width: 280px;
  }

  .image-grid.grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }

  .action-bar button {
    min-height: 44px;
    min-width: 44px;
  }
}
```

- [ ] **Step 4: Fix MomentsFeed.vue safe area**

In `frontend/src/features/moments/MomentsFeed.vue`, add to the feed container style:

```scss
@media (max-width: 768px) {
  .moments-feed {
    padding-bottom: calc(12px + var(--mobile-tabbar-height, 56px) + env(safe-area-inset-bottom, 0px));
  }
}
```

- [ ] **Step 5: Replace MomentsImageViewer.vue**

Replace the entire file with a wrapper around the new `ImageViewer` component:

```vue
<template>
  <ImageViewer
    v-model:visible="visible"
    :images="images"
    :initial-index="initialIndex"
  />
</template>

<script setup lang="ts">
import ImageViewer from "@/components/common/ImageViewer.vue";

defineProps<{
  images: string[];
  initialIndex?: number;
}>();

const visible = defineModel<boolean>("visible", { default: false });
</script>
```

- [ ] **Step 6: Fix MomentsLikeBar.vue and MomentsComments.vue**

Add to each file's `<style scoped>`:

```scss
@media (max-width: 768px) {
  .like-bar,
  .comments-section {
    gap: 6px;
    font-size: 13px;
  }

  .comment-input {
    font-size: 16px;
    min-height: 44px;
  }
}
```

- [ ] **Step 7: Fix LogMonitor.vue**

In `frontend/src/pages/LogMonitor.vue`, add to `<style scoped>`:

```scss
@media (max-width: 768px) {
  .log-controls {
    flex-wrap: wrap;
    gap: 8px;
  }

  .log-controls .el-input {
    flex: 1;
    min-width: 120px;
  }

  .log-controls .el-select {
    flex: 1;
    min-width: 100px;
  }
}

@media (max-width: 390px) {
  .log-controls {
    flex-direction: column;
  }

  .log-controls .el-input,
  .log-controls .el-select {
    width: 100%;
  }
}
```

- [ ] **Step 8: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/features/moments/ frontend/src/pages/LogMonitor.vue && git commit -m "feat(mobile): add responsive CSS for Moments and LogMonitor pages"
```

---

## Task 19: Enable Virtual Scrolling

**Files:**
- Modify: `frontend/src/features/chat/ChatMessageList.vue`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Register vue-virtual-scroller in main.ts**

In `frontend/src/main.ts`, add after the Pinia and router setup:

```typescript
import { RecycleScroller } from "vue-virtual-scroller";
app.component("RecycleScroller", RecycleScroller);
```

- [ ] **Step 2: Wrap message list with RecycleScroller**

In `frontend/src/features/chat/ChatMessageList.vue`, replace the `v-for` message rendering with a `RecycleScroller`. Find the section that renders `renderItems` and wrap it:

```html
<RecycleScroller
  v-if="renderItems.length > 0"
  ref="scrollerRef"
  class="message-scroller"
  :items="renderItems"
  :item-size="estimatedItemSize"
  key-field="id"
  :buffer="200"
  @scroll="handleScroll"
>
  <template #default="{ item }">
    <!-- existing renderItem template content -->
    <template v-if="item.kind === 'separator'">
      <div class="date-separator">{{ item.label }}</div>
    </template>
    <template v-else-if="item.kind === 'unread'">
      <div class="unread-divider">{{ item.label }}</div>
    </template>
    <template v-else>
      <ChatMessageItem
        :key="item.message.id"
        v-memo="[item.renderDigest, audioPlayingId === item.message.id]"
        :message="item.message"
        :is-self="item.isSelf"
        :show-avatar="item.showAvatar"
        :show-name="item.showName"
        :compact="item.compact"
        :highlight="item.highlight"
        @contextmenu.prevent="openContextMenu($event, item.message)"
        @preview-image="previewImage"
        @play-audio="toggleAudio(item.message)"
        @download-file="handleDownloadFile"
      />
    </template>
  </template>
</RecycleScroller>
```

Add a constant for estimated item size:

```typescript
const estimatedItemSize = 60; // average message height in px
```

- [ ] **Step 3: Adjust scroll handling for RecycleScroller**

The `RecycleScroller` exposes `@scroll` event. Adapt the existing `handleScroll` to work with it. The scroller ref provides `$el` for the scroll container.

- [ ] **Step 4: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/main.ts frontend/src/features/chat/ChatMessageList.vue && git commit -m "feat(mobile): enable vue-virtual-scroller for message list"
```

---

## Task 20: Add Action Sheet and Swipe Gestures

**Files:**
- Create: `frontend/src/components/common/ActionSheet.vue`
- Modify: `frontend/src/features/chat/ChatMessageList.vue`
- Modify: `frontend/src/components/mobile/MobileConversationList.vue`

- [ ] **Step 1: Create ActionSheet.vue**

```vue
<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="visible" class="action-sheet-overlay" @click.self="close">
        <Transition name="sheet-slide">
          <div v-if="visible" class="action-sheet">
            <div class="action-sheet-options">
              <button
                v-for="(option, index) in options"
                :key="index"
                class="action-sheet-option"
                :class="{ 'action-sheet-option--destructive': option.destructive }"
                @click="select(index)"
              >
                {{ option.label }}
              </button>
            </div>
            <button class="action-sheet-cancel" @click="close">取消</button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
export interface ActionSheetOption {
  label: string;
  destructive?: boolean;
}

defineProps<{
  options: ActionSheetOption[];
}>();

const visible = defineModel<boolean>("visible", { default: false });
const emit = defineEmits<{
  (e: "select", index: number): void;
}>();

function select(index: number) {
  emit("select", index);
  visible.value = false;
}

function close() {
  visible.value = false;
}
</script>

<style scoped lang="scss">
.action-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.action-sheet {
  width: 100%;
  max-width: 500px;
  padding: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
}

.action-sheet-options {
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
}

.action-sheet-option {
  width: 100%;
  padding: 14px;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--el-text-color-primary, #303133);
  cursor: pointer;
  text-align: center;

  & + & {
    border-top: 1px solid var(--el-border-color-lighter, #e4e7ed);
  }

  &:active {
    background: var(--el-fill-color-light, #f5f7fa);
  }

  &--destructive {
    color: var(--el-color-danger, #f56c6c);
  }
}

.action-sheet-cancel {
  width: 100%;
  padding: 14px;
  border: none;
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  cursor: pointer;

  &:active {
    background: var(--el-fill-color-light, #f5f7fa);
  }
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: transform 0.25s ease;
}
.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
```

- [ ] **Step 2: Replace context menu with Action Sheet on mobile**

In `frontend/src/features/chat/ChatMessageList.vue`, import the ActionSheet:

```typescript
import ActionSheet from "@/components/common/ActionSheet.vue";
import { useIsMobile } from "@/composables/useIsMobile";
```

Add state:

```typescript
const { isMobile } = useIsMobile();
const actionSheetVisible = ref(false);
const actionSheetTarget = ref<Message | null>(null);
```

Replace `openContextMenu` to branch:

```typescript
function openContextMenu(event: MouseEvent, message: Message) {
  if (isMobile.value) {
    actionSheetTarget.value = message;
    actionSheetVisible.value = true;
  } else {
    contextMenu.open(event, message);
  }
}
```

Add action sheet handler:

```typescript
function handleActionSelect(index: number) {
  const msg = actionSheetTarget.value;
  if (!msg) return;
  if (index === 0) actions.copy(msg);
  else if (index === 1 && msg.isSelf) actions.recall(msg);
  else if (index === 2) actions.remove(msg);
}
```

Add computed for options:

```typescript
const actionSheetOptions = computed(() => {
  const opts = [{ label: "复制" }];
  if (actionSheetTarget.value?.isSelf) {
    opts.push({ label: "撤回" });
  }
  opts.push({ label: "删除", destructive: true });
  return opts;
});
```

Add to template:

```html
<ActionSheet
  v-model:visible="actionSheetVisible"
  :options="actionSheetOptions"
  @select="handleActionSelect"
/>
```

- [ ] **Step 3: Add swipe-to-delete on conversation list**

In `frontend/src/components/mobile/MobileConversationList.vue`, add touch tracking to each session item:

```typescript
const swipeState = ref({ id: "", offsetX: 0, startX: 0 });

function onItemTouchStart(e: TouchEvent, sessionId: string) {
  swipeState.value = { id: sessionId, offsetX: 0, startX: e.touches[0].clientX };
}

function onItemTouchMove(e: TouchEvent, sessionId: string) {
  if (swipeState.value.id !== sessionId) return;
  const dx = e.touches[0].clientX - swipeState.value.startX;
  swipeState.value.offsetX = Math.min(0, Math.max(-120, dx));
}

function onItemTouchEnd(_e: TouchEvent, sessionId: string) {
  if (swipeState.value.id !== sessionId) return;
  // Snap to open (> -60px) or closed
  swipeState.value.offsetX = swipeState.value.offsetX < -60 ? -80 : 0;
}
```

Apply `transform: translateX(${offsetX}px)` to each session item via `:style`.

Add action buttons (delete, pin) behind the item with `position: absolute; right: -80px`.

- [ ] **Step 4: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/components/common/ActionSheet.vue frontend/src/features/chat/ChatMessageList.vue frontend/src/components/mobile/MobileConversationList.vue && git commit -m "feat(mobile): add Action Sheet for message actions and swipe gestures on conversation list"
```

---

## Task 21: Typing Indicator (Frontend Only)

**Files:**
- Modify: `frontend/src/features/chat/ChatComposer.vue`
- Modify: `frontend/src/components/mobile/MobileChatRoom.vue`

- [ ] **Step 1: Add typing emit to ChatComposer.vue**

In `frontend/src/features/chat/ChatComposer.vue`, add a new emit:

```typescript
const emit = defineEmits<{
  // ... existing emits
  (e: "typing"): void;
}>();
```

Add a debounced typing handler:

```typescript
let typingTimeout: ReturnType<typeof setTimeout> | null = null;

function onTextareaInput() {
  if (typingTimeout) clearTimeout(typingTimeout);
  emit("typing");
  typingTimeout = setTimeout(() => {
    typingTimeout = null;
  }, 2000);
}
```

Attach `@input="onTextareaInput"` to the textarea.

Remove the `style="display: none"` from the typing indicator template and make it reactive:

```html
<div v-if="isOtherTyping" class="typing-indicator">
  <span class="typing-dot"></span>
  <span class="typing-dot"></span>
  <span class="typing-dot"></span>
</div>
```

Add prop:

```typescript
defineProps<{
  // ... existing props
  isOtherTyping?: boolean;
}>();
```

- [ ] **Step 2: Pass typing state in MobileChatRoom.vue**

In `frontend/src/components/mobile/MobileChatRoom.vue`, add a prop for typing state and pass it to `ChatComposer`.

Note: Full typing indicator requires backend WebSocket support. This task only sets up the frontend plumbing. The `isOtherTyping` prop will be `false` until the backend sends typing events.

- [ ] **Step 3: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/features/chat/ChatComposer.vue frontend/src/components/mobile/MobileChatRoom.vue && git commit -m "feat(mobile): add typing indicator frontend plumbing"
```

---

## Task 22: Message Delivery Status Animations

**Files:**
- Modify: `frontend/src/features/chat/ChatMessageItem.vue`

- [ ] **Step 1: Add status animations**

In `frontend/src/features/chat/ChatMessageItem.vue`, find the message status indicator section and replace with animated versions:

```html
<span v-if="message.status === 'SENDING'" class="status-icon status-sending">
  <el-icon class="spin"><Loading /></el-icon>
</span>
<span v-else-if="message.status === 'SENT'" class="status-icon status-sent">
  <el-icon><Check /></el-icon>
</span>
<span v-else-if="message.status === 'DELIVERED'" class="status-icon status-delivered">
  <el-icon><Check /></el-icon>
</span>
<span v-else-if="message.status === 'READ'" class="status-icon status-read">
  <el-icon><Check /></el-icon>
</span>
```

Add to `<style scoped>`:

```scss
.status-icon {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
}

.status-sending {
  color: var(--text-placeholder);
}

.status-sent {
  color: var(--text-placeholder);
  animation: fadeIn 0.3s ease;
}

.status-delivered {
  color: var(--text-secondary);
  animation: fadeIn 0.3s ease;
}

.status-read {
  color: var(--el-color-primary);
  animation: colorShift 0.3s ease;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes colorShift {
  from { color: var(--text-secondary); }
  to { color: var(--el-color-primary); }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/features/chat/ChatMessageItem.vue && git commit -m "feat(mobile): add message delivery status animations"
```

---

## Task 23: Offline Message Queue Persistence

**Files:**
- Modify: `frontend/src/utils/messageRepo.ts`

- [ ] **Step 1: Add pending_messages store to IndexedDB**

In `frontend/src/utils/messageRepo.ts`, upgrade the database version and add a new object store. Find the `openDB` function and modify:

```typescript
const DB_NAME = "im_message_repo";
const DB_VERSION = 2; // was 1
const STORE_MESSAGES = "messages";
const STORE_PENDING = "pending_messages";
```

In the `onupgradeneeded` handler, add:

```typescript
if (!db.objectStoreNames.contains(STORE_PENDING)) {
  const pendingStore = db.createObjectStore(STORE_PENDING, { keyPath: "localId" });
  pendingStore.createIndex("byConversation", "conversationId");
  pendingStore.createIndex("byStatus", "status");
}
```

- [ ] **Step 2: Add pending queue methods**

Add to the exported `messageRepo` object:

```typescript
async addPendingMessage(conversationId: string, localId: string, payload: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  const store = tx.objectStore(STORE_PENDING);
  store.put({
    localId,
    conversationId,
    payload: JSON.stringify(payload),
    status: "pending",
    createdAt: Date.now(),
    retryCount: 0,
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
},

async listPendingMessages(conversationId?: string): Promise<Array<{ localId: string; conversationId: string; payload: string }>> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, "readonly");
  const store = tx.objectStore(STORE_PENDING);

  return new Promise((resolve, reject) => {
    const results: Array<{ localId: string; conversationId: string; payload: string }> = [];
    const request = conversationId
      ? store.index("byConversation").openCursor(IDBKeyRange.only(conversationId))
      : store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
},

async removePendingMessage(localId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  const store = tx.objectStore(STORE_PENDING);
  store.delete(localId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
},

async clearPendingMessages(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  const store = tx.objectStore(STORE_PENDING);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
},
```

- [ ] **Step 3: Integrate with message send queue**

In the message send flow (referenced in `src/stores/` message store module), add persistence on send failure:

```typescript
// In the catch block of message send:
if (isNetworkError(error)) {
  await messageRepo.addPendingMessage(conversationId, localId, messagePayload);
}
```

Add a retry function that runs on foreground/online:

```typescript
async function retryPendingMessages(): Promise<void> {
  const pending = await messageRepo.listPendingMessages();
  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload);
      await messageService.sendPrivate(payload); // or sendGroup
      await messageRepo.removePendingMessage(item.localId);
    } catch {
      // Still failing — leave in queue
    }
  }
}
```

Wire `retryPendingMessages` to `appLifecycleService.onForeground()` and `networkStatusService.onOnline()`.

- [ ] **Step 4: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/utils/messageRepo.ts frontend/src/stores/ && git commit -m "feat(mobile): add offline message queue persistence via IndexedDB"
```

---

## Task 24: Pull-to-Refresh on Message List

**Files:**
- Modify: `frontend/src/features/chat/ChatMessageList.vue`

- [ ] **Step 1: Add pull-to-refresh state**

In `frontend/src/features/chat/ChatMessageList.vue`, add refs:

```typescript
const pullState = ref<"idle" | "pulling" | "loading">("idle");
const pullDistance = ref(0);
const PULL_THRESHOLD = 60;
let pullStartY = 0;
```

- [ ] **Step 2: Add touch handlers**

```typescript
function onPullStart(e: TouchEvent) {
  const el = scrollContainerRef.value;
  if (!el || el.scrollTop > 0 || pullState.value === "loading") return;
  pullStartY = e.touches[0].clientY;
  pullState.value = "pulling";
}

function onPullMove(e: TouchEvent) {
  if (pullState.value !== "pulling") return;
  const dy = e.touches[0].clientY - pullStartY;
  pullDistance.value = Math.max(0, Math.min(120, dy * 0.5));
}

function onPullEnd() {
  if (pullState.value !== "pulling") return;
  if (pullDistance.value >= PULL_THRESHOLD) {
    pullState.value = "loading";
    pullDistance.value = 50;
    emit("request-history");
    // Reset after loading completes (watch loadingHistory prop)
  } else {
    pullState.value = "idle";
    pullDistance.value = 0;
  }
}
```

Watch `loadingHistory` to reset:

```typescript
watch(() => props.loadingHistory, (loading, wasLoading) => {
  if (wasLoading && !loading && pullState.value === "loading") {
    pullState.value = "idle";
    pullDistance.value = 0;
  }
});
```

- [ ] **Step 3: Add pull indicator template**

At the top of the scroll container, add:

```html
<div
  v-if="pullState !== 'idle'"
  class="pull-indicator"
  :style="{ height: pullDistance + 'px', opacity: pullDistance / PULL_THRESHOLD }"
>
  <el-icon v-if="pullState === 'loading'" class="spin"><Loading /></el-icon>
  <el-icon v-else-if="pullDistance >= PULL_THRESHOLD"><Bottom /></el-icon>
  <el-icon v-else><Top /></el-icon>
</div>
```

- [ ] **Step 4: Add pull indicator styles**

```scss
.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--text-tertiary);

  .spin {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 5: Attach touch events to scroll container**

On the scroll container div:

```html
<div
  ref="scrollContainerRef"
  class="chat-message-list"
  @touchstart.passive="onPullStart"
  @touchmove.passive="onPullMove"
  @touchend="onPullEnd"
>
```

- [ ] **Step 6: Typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd D:/project/new-im-project && git add frontend/src/features/chat/ChatMessageList.vue && git commit -m "feat(mobile): add pull-to-refresh on message list"
```

---

## Task 25: Final Typecheck and Lint

- [ ] **Step 1: Run full typecheck**

```bash
cd D:/project/new-im-project/frontend && npx vue-tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run lint**

```bash
cd D:/project/new-im-project/frontend && npm run lint:check
```

Expected: No errors (or only pre-existing warnings).

- [ ] **Step 3: Run tests**

```bash
cd D:/project/new-im-project/frontend && npm run test:unit
```

Expected: All existing tests pass.

- [ ] **Step 4: Build**

```bash
cd D:/project/new-im-project/frontend && npm run build:dev
```

Expected: Build succeeds.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
cd D:/project/new-im-project && git add -A && git commit -m "chore(mobile): fix lint/typecheck issues from mobile improvements"
```
