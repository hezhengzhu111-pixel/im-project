# Android Release Runbook

## Scope

This document covers the Android release handoff for `frontend/apps/mobile` from local debug to internal release APK and AAB generation.

Goals for this phase:

- keep business logic unchanged
- keep backend unchanged
- keep real signing materials out of source control
- keep Firebase production config out of source control
- keep release minify optional

## Prerequisites

- Node.js 22 or newer
- npm workspace commands run from `frontend/`
- JDK 17 available to Gradle
- Android SDK and build tools installed
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` configured, or `android/local.properties` present locally
- local release keystore stored outside the repository, or in an ignored local path

## Local Debug Build

Install dependencies:

```bash
cd frontend
npm install
```

Start Metro:

```bash
cd frontend
npm run mobile:start
```

Build and install the debug app:

```bash
cd frontend
npm run mobile:android
```

Optional debug environment injection:

```bash
IM_MOBILE_APP_ENV=dev-emulator
IM_MOBILE_API_BASE_URL=http://10.0.2.2:8082/api
IM_MOBILE_WS_BASE_URL=ws://10.0.2.2:8082
IM_MOBILE_FILE_BASE_URL=http://10.0.2.2:8082
```

PowerShell example:

```powershell
$env:IM_MOBILE_APP_ENV="dev-emulator"
$env:IM_MOBILE_API_BASE_URL="http://10.0.2.2:8082/api"
$env:IM_MOBILE_WS_BASE_URL="ws://10.0.2.2:8082"
$env:IM_MOBILE_FILE_BASE_URL="http://10.0.2.2:8082"
cd frontend
npm run mobile:android
```

## Release Signing Variables

Release APK and AAB builds require all four signing variables:

```bash
IM_MOBILE_RELEASE_STORE_FILE
IM_MOBILE_RELEASE_STORE_PASSWORD
IM_MOBILE_RELEASE_KEY_ALIAS
IM_MOBILE_RELEASE_KEY_PASSWORD
```

Rules:

- do not commit the keystore file
- do not commit signing passwords
- do not write real secrets into `gradle.properties`
- keep keystore paths local, CI-secret injected, or shell-injected only

PowerShell example:

```powershell
$env:IM_MOBILE_RELEASE_STORE_FILE="C:\secure\im-mobile-release.jks"
$env:IM_MOBILE_RELEASE_STORE_PASSWORD="replace-me"
$env:IM_MOBILE_RELEASE_KEY_ALIAS="im-mobile"
$env:IM_MOBILE_RELEASE_KEY_PASSWORD="replace-me"
```

Bash example:

```bash
export IM_MOBILE_RELEASE_STORE_FILE="$HOME/secure/im-mobile-release.jks"
export IM_MOBILE_RELEASE_STORE_PASSWORD="replace-me"
export IM_MOBILE_RELEASE_KEY_ALIAS="im-mobile"
export IM_MOBILE_RELEASE_KEY_PASSWORD="replace-me"
```

The release wrapper script fails fast if any variable is missing or if the keystore file does not exist.

## Version Configuration

`versionCode` and `versionName` support three layers:

1. Gradle property
2. environment variable
3. default value

Defaults:

- `IM_MOBILE_VERSION_CODE=1`
- `IM_MOBILE_VERSION_NAME=0.0.1`

CLI with Gradle properties:

```bash
cd frontend/apps/mobile/android
./gradlew assembleRelease -PIM_MOBILE_VERSION_CODE=12 -PIM_MOBILE_VERSION_NAME=1.2.0
./gradlew bundleRelease -PIM_MOBILE_VERSION_CODE=12 -PIM_MOBILE_VERSION_NAME=1.2.0
```

PowerShell with environment variables:

```powershell
$env:IM_MOBILE_VERSION_CODE="12"
$env:IM_MOBILE_VERSION_NAME="1.2.0"
```

Wrapper-script form:

```bash
cd frontend
npm run mobile:android:release:apk -- --versionCode 12 --versionName 1.2.0
npm run mobile:android:release:aab -- --versionCode 12 --versionName 1.2.0
```

## Release Environment Injection

Release builds must not silently use emulator defaults.

Required runtime variables for a real internal or production-like release:

```bash
IM_MOBILE_APP_ENV
IM_MOBILE_API_BASE_URL
IM_MOBILE_WS_BASE_URL
IM_MOBILE_FILE_BASE_URL
```

Notes:

- debug may use `dev-emulator`
- release keeps `usesCleartextTraffic=false`
- release fails if it still resolves to `10.0.2.2` unless `IM_MOBILE_APP_ENV=internal` or `debug` is explicitly set for internal-only validation
- use `sit`, `prod`, or a controlled `internal` value for release packaging

PowerShell SIT example:

```powershell
$env:IM_MOBILE_APP_ENV="sit"
$env:IM_MOBILE_API_BASE_URL="https://sit.example.invalid/api"
$env:IM_MOBILE_WS_BASE_URL="wss://sit.example.invalid"
$env:IM_MOBILE_FILE_BASE_URL="https://sit.example.invalid"
```

## Release APK Build

From the workspace root:

```bash
cd frontend
npm run mobile:android:release:apk
```

Direct Gradle form:

```bash
cd frontend/apps/mobile/android
./gradlew assembleRelease
```

Expected artifact path:

```text
frontend/apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

## Release AAB Build

From the workspace root:

```bash
cd frontend
npm run mobile:android:release:aab
```

Direct Gradle form:

```bash
cd frontend/apps/mobile/android
./gradlew bundleRelease
```

Expected artifact path:

```text
frontend/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

## Release Minify Switch

Release minify is intentionally gated and remains off by default.

- default: `IM_MOBILE_MINIFY_RELEASE=false`
- enable only when release packaging is stable and verification is complete

Examples:

```powershell
$env:IM_MOBILE_MINIFY_RELEASE="true"
cd frontend
npm run mobile:android:release:aab
```

```bash
cd frontend
npm run mobile:android:release:apk -- --minify true
```

The project keeps conservative Proguard and R8 rules for React Native core plus current native libraries such as Firebase, Notifee, MMKV, Quick SQLite, Reanimated, Worklets, and Nitro modules.

## Firebase Configuration

Firebase is not required for local debug packaging, and real production Firebase config must not be committed.

Local guidance:

- place `google-services.json` only in `frontend/apps/mobile/android/app/` on your local machine when you need Firebase-backed testing
- use a non-production Firebase project for local or internal verification
- keep the file untracked

Release guidance:

- confirm the Android package registered in Firebase matches the current `applicationId`
- confirm the sender id, app id, and SHA certificate registrations are correct for the signing key being used
- verify that missing Firebase config does not block non-push local validation if the release target does not require push during this phase

## Validate The Release Package

Before packaging:

```bash
cd frontend
npm run mobile:typecheck
npm run mobile:test
npm run mobile:lint
```

If the local Android toolchain is available:

```bash
cd frontend/apps/mobile/android
./gradlew assembleRelease
./gradlew bundleRelease
```

Manual validation checklist:

- install the release APK on a test device
- confirm app launch succeeds without Metro
- confirm the app is not pointing at `10.0.2.2`
- confirm login and key network flows reach the intended SIT or internal endpoint
- confirm cleartext HTTP is not required in release
- confirm notifications degrade safely if Firebase is intentionally absent for local testing
- confirm version name and version code on the installed package

Useful inspection commands:

```bash
cd frontend/apps/mobile/android
./gradlew signingReport
```

```bash
aapt dump badging app-release.apk
```

## Pre-Release Manual Items

- confirm `applicationId` is final before publishing; this runbook does not change it automatically
- provide the real release keystore outside git
- provide signing secrets through local shell or secure secret injection
- provide the correct Firebase config locally when push validation is required
- confirm final SIT or production gateway addresses
- decide whether release minify should remain off for the current release train
- confirm Play Console package name, version progression, and upload track
