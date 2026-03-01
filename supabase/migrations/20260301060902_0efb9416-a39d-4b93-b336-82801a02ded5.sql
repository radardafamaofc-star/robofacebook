
-- Allow insert, update, delete on license_keys for admin panel (using anon key for now)
CREATE POLICY "Allow insert license keys" ON public.license_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update license keys" ON public.license_keys FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete license keys" ON public.license_keys FOR DELETE USING (true);
