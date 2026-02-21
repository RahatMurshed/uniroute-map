
-- Allow admins to delete live_locations
CREATE POLICY "Admins can delete live_locations"
  ON public.live_locations
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to read students_on_bus (needed for .in() filter)
CREATE POLICY "Admins can read students_on_bus"
  ON public.students_on_bus
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete students_on_bus
CREATE POLICY "Admins can delete students_on_bus"
  ON public.students_on_bus
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
