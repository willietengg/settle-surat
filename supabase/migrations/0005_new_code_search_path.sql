-- Supabase security advisor: 固定 search_path
alter function private.new_code() set search_path = public;
