
-- TABLE 2: routes (created first due to FK dependencies)
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stop_sequence JSONB,
  active_days INTEGER[],
  color_hex TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- TABLE 3: stops
CREATE TABLE public.stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  landmark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;

-- TABLE 1: buses
CREATE TABLE public.buses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  license_plate TEXT,
  capacity INTEGER,
  default_route_id UUID REFERENCES public.routes(id),
  driver_id UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;

-- TABLE 4: trips
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID REFERENCES public.buses(id) NOT NULL,
  route_id UUID REFERENCES public.routes(id) NOT NULL,
  driver_id UUID REFERENCES public.profiles(id) NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- TABLE 5: live_locations
CREATE TABLE public.live_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID REFERENCES public.buses(id) NOT NULL,
  trip_id UUID REFERENCES public.trips(id) NOT NULL,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  speed_kmh DECIMAL(5,2),
  heading DECIMAL(5,2),
  accuracy_m INTEGER,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- Enable realtime for live_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;

-- TABLE 6: exceptions
CREATE TABLE public.exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID REFERENCES public.buses(id) NOT NULL,
  exception_date DATE NOT NULL,
  type TEXT NOT NULL,
  override_route_id UUID REFERENCES public.routes(id),
  time_offset_mins INTEGER,
  notes TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;

-- TABLE 7: push_subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES public.routes(id) NOT NULL,
  stop_id UUID REFERENCES public.stops(id) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- TABLE 8: students_on_bus
CREATE TABLE public.students_on_bus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) NOT NULL,
  anonymous_id TEXT NOT NULL,
  boarded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.students_on_bus ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- stops: public read, admin write
CREATE POLICY "Public can read stops" ON public.stops FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert stops" ON public.stops FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update stops" ON public.stops FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete stops" ON public.stops FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- routes: authenticated read, admin write
CREATE POLICY "Authenticated can read routes" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert routes" ON public.routes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update routes" ON public.routes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete routes" ON public.routes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- buses: authenticated read, admin write
CREATE POLICY "Authenticated can read buses" ON public.buses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert buses" ON public.buses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update buses" ON public.buses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete buses" ON public.buses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- trips: authenticated read, admin/driver write
CREATE POLICY "Authenticated can read trips" ON public.trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage trips" ON public.trips FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Drivers can insert trips" ON public.trips FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'driver'));

-- live_locations: public read (for map), drivers insert for their assigned bus
CREATE POLICY "Public can read live locations" ON public.live_locations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Drivers can insert own bus location" ON public.live_locations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'driver')
    AND EXISTS (
      SELECT 1 FROM public.buses WHERE buses.id = bus_id AND buses.driver_id = auth.uid()
    )
  );

-- exceptions: admin only for write, authenticated read
CREATE POLICY "Authenticated can read exceptions" ON public.exceptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert exceptions" ON public.exceptions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update exceptions" ON public.exceptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete exceptions" ON public.exceptions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- push_subscriptions: anyone can insert, no select for others
CREATE POLICY "Anyone can insert push subscription" ON public.push_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);

-- students_on_bus: anyone can insert, no select
CREATE POLICY "Anyone can insert student boarding" ON public.students_on_bus FOR INSERT TO anon, authenticated WITH CHECK (true);
