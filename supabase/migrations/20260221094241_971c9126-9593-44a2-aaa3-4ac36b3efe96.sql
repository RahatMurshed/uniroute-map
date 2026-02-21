-- Allow anyone to read push_subscriptions (needed to check subscription status)
CREATE POLICY "Anyone can read push subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (true);

-- Allow anyone to delete push subscriptions (unsubscribe flow, needs endpoint match in app code)
CREATE POLICY "Anyone can delete push subscriptions"
ON public.push_subscriptions
FOR DELETE
USING (true);