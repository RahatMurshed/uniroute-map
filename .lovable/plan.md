

## Plan

### 1. Add Demo Admin Credentials on Login Page

Add a "Demo Access" section below the login form with a clickable card that auto-fills admin credentials:

- A subtle divider with "Demo Access" label
- A card styled with `bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4` containing:
  - "Admin Demo" badge in red
  - Description: "Explore the full admin dashboard"
  - "Try Demo" button that auto-fills email/password fields
- Use hardcoded demo credentials (e.g. `demo@uniroute.app` / `demo123456`)
- **Requires creating this demo account in the database** via a migration or manually — will note this for the user

**Important**: This needs an actual admin user in the auth system. I'll add the UI and prompt the user to create the account.

### 2. Polish Driver Page UI

**Bus Selection Screen:**
- Improve the white card: add subtle shadow (`shadow-2xl`), better spacing
- Style the select dropdowns with icons more prominently
- Add a subtle gradient/pattern to the dark background section
- Improve the trip preview card animation

**Active Trip Screen:**
- Add subtle gradient background variation
- Make the stats grid cards slightly more polished with hover states
- Improve the GPS quality bar with a label showing the percentage
- Add subtle glow effects to the broadcasting status pill

**Resume Trip Banner:**
- Better visual hierarchy, add a clock animation
- More prominent resume button

**General Polish:**
- Smoother transitions throughout
- Better typography hierarchy
- Subtle background decoration (gradient orbs like login page)
- Improve button hover/active states

### Files to modify

| File | Change |
|------|--------|
| `src/pages/LoginPage.tsx` | Add demo credentials section with auto-fill |
| `src/pages/DriverPage.tsx` | Visual polish — background orbs, card shadows, better typography, smoother animations |

### Database consideration
Will need to create a demo admin user. I'll add the UI first, then inform the user they need to create the `demo@uniroute.app` account with admin role.

