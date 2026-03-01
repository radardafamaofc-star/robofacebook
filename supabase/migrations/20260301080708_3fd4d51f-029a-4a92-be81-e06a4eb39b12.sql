INSERT INTO storage.buckets (id, name, public)
VALUES ('extension', 'extension', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for extension bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'extension');