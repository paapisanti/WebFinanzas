-- Permisos para el rol authenticated (Supabase ya no los concede solo a las tablas creadas por SQL).
-- La seguridad real sigue siendo RLS: cada usuario solo ve sus filas.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Solo para el programador diario, no para usuarios
revoke execute on function public.snapshot_all_users() from public, anon, authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
