DROP POLICY "Admins can insert exceptions" ON public.exceptions;
DROP POLICY "Drivers can insert exceptions for their own bus" ON public.exceptions;

CREATE POLICY "Admins can insert exceptions"
  ON public.exceptions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Drivers can insert exceptions for their own bus"
  ON public.exceptions FOR INSERT
  WITH CHECK (created_by = auth.uid());