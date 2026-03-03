
-- Create resellers table
CREATE TABLE public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

-- Enable RLS
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

-- RLS policies (admin-only via authenticated)
CREATE POLICY "Authenticated users can select resellers"
  ON public.resellers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert resellers"
  ON public.resellers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update resellers"
  ON public.resellers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete resellers"
  ON public.resellers FOR DELETE TO authenticated USING (true);

-- Link license_keys to resellers
ALTER TABLE public.license_keys ADD COLUMN reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL;
