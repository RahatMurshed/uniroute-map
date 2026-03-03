

## Problem

The student-facing map page (`/map`) has no login button or link to the staff/driver portal. Users cannot discover the `/login` route without manually typing it in the URL.

## Plan

### 1. Add a "Staff Login" button to the MapPage header

In `src/pages/MapPage.tsx`, add a subtle login icon-button in the top bar's right section (next to the Live indicator and notification bell):

- Use a `LogIn` icon from lucide-react
- Wrap it in a `Link` (or `useNavigate`) pointing to `/login`
- Style it as a small round button matching the existing bell button style: `w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm`
- Tooltip or aria-label: "Staff Login"

### 2. Polish the LoginPage for portfolio impact

Redesign `src/pages/LoginPage.tsx` to look premium and impressive:

- **Left panel** (desktop): Dark background `#0F172A` instead of bland `bg-secondary`. Add subtle gradient orbs (similar to driver page). Show UniRoute logo, tagline, and 3 feature highlights (Real-time tracking, Smart ETA, Push notifications) with small icons — demonstrates the product's value.
- **Right panel**: Clean white form area with refined spacing.
- **Mobile**: Dark branded header with logo, flowing into the white form below.
- **Form polish**: Larger inputs (h-14), rounder corners (rounded-2xl), the Sign In button uses `bg-[#CC1B1B]` with `hover:bg-[#A81515]` to match the app's red branding consistently. Add a subtle "Powered by UniRoute" footer.
- **Forgot password button**: Keep as-is (non-functional placeholder).

### 3. Files to modify

| File | Change |
|------|--------|
| `src/pages/MapPage.tsx` | Add `LogIn` icon import + login button in header right section |
| `src/pages/LoginPage.tsx` | Redesign with dark left panel, feature highlights, branded red button, polished inputs |

### Technical notes
- No new dependencies needed — uses existing lucide-react icons and Tailwind classes
- No routing changes — `/login` route already exists in `App.tsx`
- All existing login logic (auth, role-based redirect, error handling) stays untouched

