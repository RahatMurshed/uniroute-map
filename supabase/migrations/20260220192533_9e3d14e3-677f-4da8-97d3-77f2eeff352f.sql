
-- Allow drivers to update their own trips (e.g. end trip)
CREATE POLICY "Drivers can update own trips"
ON public.trips FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'driver') AND driver_id = auth.uid());
