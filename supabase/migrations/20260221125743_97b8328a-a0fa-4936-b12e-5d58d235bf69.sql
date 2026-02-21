-- Allow drivers to update the notified flag on exceptions they created
CREATE POLICY "Drivers can update notified on own exceptions"
ON public.exceptions
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());