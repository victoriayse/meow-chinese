-- Keep existing food records; built-in pots use slots 4–9, table sides use 0–3.
DO $change$
declare src text;
begin
 select pg_get_functiondef('mall_private.action(text,text,jsonb)'::regprocedure) into src;
 if position('split_part(pot,''#'',1)=''mallpot''' in src) = 0 then raise exception 'Unexpected mall function; inspect before updating'; end if;
 src := replace(src, 'split_part(pot,''#'',1)=''mallpot''', 'split_part(pot,''#'',1) in (''mallpot'',''mallhotpottable'')');
 src := replace(src, 'from generate_series(0,5) x', 'from generate_series(case when split_part(pot,''#'',1)=''mallhotpottable'' then 4 else 0 end, case when split_part(pot,''#'',1)=''mallhotpottable'' then 9 else 5 end) x');
 execute src;
end $change$;
