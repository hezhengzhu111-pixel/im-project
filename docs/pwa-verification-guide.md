# PWA Verification Guide

This guide provides step-by-step instructions for verifying PWA functionality in the browser.

## Prerequisites

1. Build the Flutter Web app:
   ```bash
   cd flutter/apps/web
   flutter build web
   ```

2. Serve the built files:
   ```bash
   cd build/web
   python -m http.server 8000
   # or
   npx serve -s . -l 8000
   ```

3. Open http://localhost:8000 in Chrome

## 1. PWA Installation Verification

### Steps:
1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Manifest** in the left sidebar
4. Verify:
   - [ ] Name: "IM Messenger"
   - [ ] Short name: "IM"
   - [ ] Display: "standalone"
   - [ ] Theme color: "#1a1a2e"
   - [ ] Icons are displayed correctly

5. Look for install button in address bar
6. Click to install PWA
7. Verify app opens in standalone window

### Expected Result:
- Manifest is valid
- App can be installed
- App opens without browser UI

## 2. Service Worker Registration

### Steps:
1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in the left sidebar
4. Verify:
   - [ ] Service worker is registered
   - [ ] Status: activated and is running
   - [ ] Scope: "/"

5. Check **Cache Storage**:
   - [ ] im-messenger-v1 cache exists
   - [ ] Contains index.html, main.dart.js, etc.

### Expected Result:
- Service worker is active
- App shell is precached

## 3. Offline Functionality

### Steps:
1. Open the app in browser
2. Open DevTools > **Network** tab
3. Check **Offline** checkbox
4. Refresh the page
5. Verify:
   - [ ] App loads from cache
   - [ ] Offline banner appears: "网络已断开，部分功能可能不可用"
   - [ ] UI is functional (can navigate)

### Expected Result:
- App works offline
- Offline banner is displayed

## 4. Message Sending Verification

### Steps:
1. Open the app and login
2. Open a chat conversation
3. Open DevTools > **Network** tab
4. Check **Offline** checkbox
5. Type and send a message
6. Verify:
   - [ ] Message shows "SENDING" status
   - [ ] NetworkStatusBanner shows pending message count
   - [ ] Message is queued in outbox

7. Uncheck **Offline** checkbox
8. Verify:
   - [ ] Message status changes to "SENT"
   - [ ] Pending count decreases
   - [ ] Message appears in chat history

### Expected Result:
- Messages are queued when offline
- Messages are sent when online

## 5. Network Recovery Verification

### Steps:
1. Open the app and login
2. Open a chat conversation
3. Go offline (DevTools > Network > Offline)
4. Send multiple messages
5. Verify pending count increases
6. Go online (uncheck Offline)
7. Verify:
   - [ ] Messages are sent automatically
   - [ ] Status changes from "SENDING" to "SENT"
   - [ ] No error messages

### Expected Result:
- Outbox retries automatically on network recovery

## 6. Cache Version Management

### Steps:
1. Open DevTools > **Application** > **Cache Storage**
2. Verify cache names:
   - [ ] im-messenger-v1 (app shell)
   - [ ] im-runtime-v1 (static assets)
   - [ ] im-images-v1 (images)
   - [ ] im-api-v1 (API responses)

### Expected Result:
- Separate caches for different resource types
- Version suffix for cache invalidation

## Troubleshooting

### Service Worker Not Registering
- Check console for errors
- Ensure HTTPS or localhost
- Clear cache and hard refresh (Ctrl+Shift+R)

### Icons Not Displaying
- Verify icon files exist in web/icons/
- Check manifest.json icon paths
- Clear cache and refresh

### Messages Not Sending
- Check Network tab for failed requests
- Verify API endpoint is correct
- Check console for errors

## Browser Support

Tested on:
- Chrome 120+
- Edge 120+
- Firefox 120+
- Safari 17+

Note: Some features may not work in older browsers.
