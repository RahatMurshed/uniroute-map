-- Add 'inactive_driver' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'inactive_driver';

-- Allow admins to manage user_roles (needed for deactivate/reactivate from edge function with service role, 
-- but also good practice for direct admin access)
CREATE POLICY "Admins can insert user_roles"
ON public.user_roles FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update user_roles"
ON public.user_roles FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete user_roles"
ON public.user_roles FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to read all user_roles (needed to list drivers)
CREATE POLICY "Admins can read all user_roles"
ON public.user_roles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));