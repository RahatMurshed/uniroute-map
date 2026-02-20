

# UniRoute — University Bus Tracking PWA

## Overview
A Progressive Web App for tracking university buses with role-based access for public users, drivers, and admins.

## 1. Project Foundation
- Add **Zustand** for state management
- Configure **PWA manifest** and service worker registration for installability
- Set up the project folder structure:
  - `src/lib/` — Supabase client
  - `src/stores/` — Zustand stores (auth store)
  - `src/pages/` — Route pages
  - `src/components/` — Shared components

## 2. Supabase Backend (Lovable Cloud)
- Enable Lovable Cloud to provision the Supabase backend
- Create a **profiles** table linked to `auth.users` with auto-creation trigger
- Create a **user_roles** table with an `app_role` enum (`driver`, `admin`) and a `has_role()` security definer function
- Enable RLS on both tables with appropriate policies

## 3. Authentication & Auth Store
- Create a Zustand auth store that manages session state via `onAuthStateChange`
- Store current user and their role(s)
- Supabase client initialized at `src/lib/supabase.ts`

## 4. Routing Setup (4 Routes)
- **`/map`** — Public page (placeholder, no login required)
- **`/driver`** — Protected route, accessible only to users with `driver` role
- **`/admin`** — Protected route, accessible only to users with `admin` role
- **`/login`** — Login page for drivers and admins
- **`/`** — Redirects to `/map`
- A **ProtectedRoute** wrapper component that checks auth + role before rendering

## 5. Placeholder Pages
- Each route will render a minimal placeholder (page title only) — no full UI yet
- Login page will have a basic email/password form wired to Supabase Auth

