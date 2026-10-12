-- Add egg tart only to the bakery menu. Keep all permission checks and existing records.
DO $change$
declare src text;
begin
 select pg_get_functiondef('mall_private.action(text,text,jsonb)'::regprocedure) into src;
 if position('''cookies'',''bottledwater'',''tea'']' in src) = 0 then raise exception 'Unexpected bakery menu; inspect before updating'; end if;
 execute replace(src, '''cookies'',''bottledwater'',''tea'']', '''cookies'',''eggtart'',''bottledwater'',''tea'']');
end $change$;
