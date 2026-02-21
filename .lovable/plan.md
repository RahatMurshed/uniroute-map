

# Fix: Push Notifications Incorrectly Detected as Unsupported

## Problem

In `src/hooks/usePushNotifications.ts` (line 39), the browser support check uses:

```js
"PushManager" in navigator
```

`PushManager` is a global constructor on `window`, **not** a property of `navigator`. This expression always evaluates to `false`, making `supported` permanently `false` even on Chrome and Firefox.

## Solution

Change the check to `"PushManager" in window`:

**File: `src/hooks/usePushNotifications.ts` (line 39)**

```diff
- const supported = "serviceWorker" in navigator && "PushManager" in navigator && "Notification" in window;
+ const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
```

This is the only change needed. Everything else (subscription flow, bell UI, edge functions) is already wired up correctly.

