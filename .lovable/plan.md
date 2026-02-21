

# Fix: Notification Bell Button Not Visible

## Problem

The bell button is wrapped in `{push.supported && (...)}` (line 351 of MapPage.tsx). The `usePushNotifications` hook sets `supported` to `true` only when all three browser APIs exist: `serviceWorker`, `PushManager`, and `Notification`. In the Lovable preview iframe (and some browsers like iOS Safari), these APIs are unavailable, so the bell is permanently hidden.

## Solution

Always show the bell button regardless of browser support. When push is not supported, tapping the bell should display a helpful message instead of hiding it entirely.

### Changes

**1. `src/pages/MapPage.tsx` (line 351)**

Remove the `push.supported &&` conditional so the bell always renders. Update the click handler to show an alert when push is not supported:

- If not supported: show a toast/alert saying "Push notifications are not supported in this browser. Please use Chrome or Firefox on Android/desktop."
- If supported but denied: show the denied state (current behavior)
- If supported and subscribed: prompt to unsubscribe (current behavior)
- If supported and not subscribed: open the notification sheet (current behavior)

**2. `src/hooks/usePushNotifications.ts`**

No changes needed -- the `supported` flag is still useful for the click handler logic, just not for hiding the button.

### Visual States (unchanged)

- Grey bell: not subscribed (or not supported)
- Orange bell: subscribed
- Bell with slash: permission denied

