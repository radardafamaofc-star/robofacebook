-- Add user_id column to resellers to link with auth.users
ALTER TABLE public.resellers ADD COLUMN user_id uuid UNIQUE;