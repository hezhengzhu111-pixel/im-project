# Android Environment Config Report

## 1. Scope

- Add Android environment layering for `frontend/apps/mobile`
- Keep React Native CLI architecture unchanged
- Keep debug emulator default behavior available
- Avoid hardcoding production endpoints in source control

## 2. Supported Environments

- `dev-emulator`: default `10.0.2.2`
- `dev-device`: physical Android device over LAN
- `sit`: SIT gateway
- `prod`: production placeholder injected externally

Release builds also accept `internal` / `debug` as explicit internal-only bypass values when keeping emulator URLs on purpose.

## 3. Injection Strategy

Android accepts these Gradle properties or environment variables:

- `IM_MOBILE_APP_ENV`
- `IM_MOBILE_API_BASE_URL`
- `IM_MOBILE_WS_BASE_URL`
- `IM_MOBILE_FILE_BASE_URL`

Native export path:

1. Gradle resolves and validates the values
2. Values are written into Android `BuildConfig`
3. A lightweight RN `ConfigModule` exposes them synchronously to JS
4. JS resolves final config with this priority:
   - runtime injected config
   - env / native config
   - built-in `dev-emulator` fallback

## 4. URL Validation

- `API_BASE_URL` / `FILE_BASE_URL`: `http://` or `https://`
- `WS_BASE_URL`: `ws://` or `wss://`
- Invalid JS-side values are ignored with warnings and fall back to the next source
- Invalid Gradle-side values fail the Android build immediately

## 5. Release Safeguard

- Debug builds may continue to use the default emulator URLs
- Release builds must not silently use `10.0.2.2`
- If a release build still resolves to emulator fallback URLs, Gradle fails fast unless `IM_MOBILE_APP_ENV=internal` or `debug` is explicitly provided

## 6. Files Added or Updated

- `src/constants/runtimeConfig.ts`
- `src/constants/config.ts`
- `src/constants/config.test.ts`
- `android/app/build.gradle`
- `android/gradle.properties`
- `android/app/src/main/java/com/immobile/ConfigModule.kt`
- `android/app/src/main/java/com/immobile/ConfigPackage.kt`
- `android/app/src/main/java/com/immobile/MainApplication.kt`
- `.env.example`
- `README.md`
- `ANDROID_RUNBOOK.md`

## 7. Validation Plan

- Config default value test
- Config priority test
- URL validation fallback test
- Release fallback warning test
- `mobile:typecheck`
- `mobile:test`
- `mobile:lint`
- `mobile:clean`

## 8. Validation Results

- `cd frontend && npm run mobile:typecheck`: PASS
- `cd frontend && npm run mobile:test`: PASS
- `cd frontend && npm run mobile:lint`: PASS
- `cd frontend && npm run mobile:clean`: BLOCKED
  - Failure is not caused by the new config layering logic
  - Current blocker remains Windows native clean for `react-native-worklets`
  - Observed error: `:app:externalNativeBuildCleanDebug` -> `ninja: fatal: GetOverlappedResult`
