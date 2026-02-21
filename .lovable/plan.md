

# Fix: NotificationSheet Hidden Behind Map

## Problem

When clicking the bell button, `setNotifSheetOpen(true)` IS being called, but the NotificationSheet is invisible because it renders behind the Leaflet map layer.

- The top bar uses `z-[1000]`
- Leaflet map tiles and overlays use z-indices in the 200-800 range
- The NotificationSheet backdrop uses `z-40` and the sheet uses `z-50`
- Result: the sheet opens but is completely hidden behind the map

## Solution

Update the z-index values in `src/components/NotificationSheet.tsx` to be higher than the map:

### File: `src/components/NotificationSheet.tsx`

**Line ~54 (backdrop):** Change `z-40` to `z-[2000]`

**Line ~58 (sheet):** Change `z-50` to `z-[2001]`

This ensures both the backdrop overlay and the bottom sheet render above all map layers and the top bar.

No other files need changes.

