-- Preserve each ingredient's original table while it cooks in a shared pot.
alter table public.mall_food add column if not exists cook_table text;
do $migration$
declare src text; old_text text; new_text text;
begin
 select pg_get_functiondef('mall_private.action(text,text,jsonb)'::regprocedure) into src;
 old_text := 'update public.mall_food set state=''pot'',furniture=pot,slot=spot where id=rec.id;';
 new_text := 'update public.mall_food set state=''pot'',cook_table=rec.furniture,furniture=pot,slot=spot,ready_at=now()+interval ''3 seconds'',delivered_at=null where id=rec.id;';
 if position(old_text in src)=0 then raise exception 'Expected pot rule missing'; end if;
 src:=replace(src,old_text,new_text);
 old_text := ' for rec in select * from public.mall_food where venue=p_venue and state=''waiting''';
 new_text := $body$
 -- Cooked dishes return to their source table; a full table waits safely.
 for rec in select * from public.mall_food where venue=p_venue and state='pot' and ready_at<=now() order by ready_at,id for update loop
  target:=coalesce(rec.cook_table,case when split_part(rec.furniture,'#',1)='mallhotpottable' then rec.furniture end);
  if target is null then
   select e->>'id' into target from jsonb_array_elements(entries) e where split_part(e->>'id','#',1) in ('malltable','mallhotpottable','cafetable2','cafetable4') order by e->>'id' limit 1;
  end if;
  if target is null or not exists(select 1 from jsonb_array_elements(entries) e where e->>'id'=target and split_part(e->>'id','#',1) in ('malltable','mallhotpottable','cafetable2','cafetable4')) then
   update public.mall_food set state='counter',furniture=null,slot=null,cook_table=null,delivered_at=null where id=rec.id;
  else
   capacity:=case split_part(target,'#',1) when 'cafetable2' then 2 else 4 end;
   select x into spot from generate_series(0,capacity-1) x where not exists(select 1 from public.mall_food f where f.venue=p_venue and f.furniture=target and f.slot=x and f.state in ('table','pot')) order by x limit 1;
   if spot is not null then
    update public.mall_food set state='table',furniture=target,slot=spot,cook_table=null,delivered_at=null where id=rec.id;
   end if;
  end if;
 end loop;
 for rec in select * from public.mall_food where venue=p_venue and state='waiting'$body$;
 if position(old_text in src)=0 then raise exception 'Expected refresh rule missing'; end if;
 src:=replace(src,old_text,new_text);
 src:=replace(src,'''deliveredAt'',delivered_at)', '''deliveredAt'',delivered_at,''cookReadyAt'',case when state=''pot'' then ready_at end)');
 execute src;
end $migration$;
