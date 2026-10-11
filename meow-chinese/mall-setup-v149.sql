-- Mall data is separate from existing cafe and cinema records.
create schema if not exists mall_private;
revoke all on schema mall_private from public, anon;
grant usage on schema mall_private to authenticated;
create table public.mall_food (
 id uuid primary key default gen_random_uuid(), venue text not null check(venue in ('mallbakery','mallcoffee','mallhotpot')),
 item text not null, buyer uuid not null, batch uuid not null, ordinal integer not null default 0,
 state text not null default 'waiting' check(state in ('waiting','counter','table','pot','taken')),
 furniture text, slot integer, created_at timestamptz not null default now(), ready_at timestamptz not null default (now()+interval '3 seconds'), delivered_at timestamptz,
 unique(batch,ordinal)
);
alter table public.mall_food enable row level security;
revoke all on public.mall_food from public, anon, authenticated;
create index mall_food_active on public.mall_food(venue,created_at) where state <> 'taken';
create unique index mall_food_table_slot on public.mall_food(venue,furniture,slot) where state in ('table','pot');
create function mall_private.action(p_action text,p_venue text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lay jsonb; entries jsonb; allowed text[]; foods text[]; food text; target text; pot text; token uuid; n integer; spot integer; capacity integer; rec public.mall_food; kiosk text;
begin
 if auth.uid() is null then raise exception 'signed out'; end if;
 if p_venue not in ('mallbakery','mallcoffee','mallhotpot') then raise exception 'unknown venue'; end if;
 select layout into lay from public.public_places where key='mall';
 entries:=coalesce(lay->'rooms'->p_venue,'[]'::jsonb);
 allowed:=case p_venue
 when 'mallbakery' then array['croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','tart','cookies','bottledwater','tea']
 when 'mallcoffee' then array['coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha','bottledwater','croissant','cakeslice']
 else array['hotpotveg','hotpotmeat','hotpotseafood','hotpotfishball','hotpotmushroom','hotpotnoodles','bottledwater','tea'] end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mall:'||p_venue,0));
 if p_action='order' then
  kiosk:=p_venue||'kiosk';
  if not exists(select 1 from jsonb_array_elements(entries) e where split_part(e->>'id','#',1)=kiosk) then raise exception 'kiosk unavailable'; end if;
  token:=(p_data->>'token')::uuid;
  if token is null then raise exception 'missing token'; end if;
  if exists(select 1 from public.mall_food where batch=token) then
   if exists(select 1 from public.mall_food where batch=token and (buyer<>auth.uid() or venue<>p_venue)) then raise exception 'bad token'; end if;
   return jsonb_build_object('accepted',true);
  end if;
  select array_agg(value) into foods from jsonb_array_elements_text(p_data->'items');
  if coalesce(cardinality(foods),0) not between 1 and 12 then raise exception 'bad order'; end if;
  if p_data->>'service'='table' then
   select id into target from (select e->>'id' id,row_number() over(order by e->>'id' collate "C") num from jsonb_array_elements(entries) e where split_part(e->>'id','#',1) in ('malltable','mallhotpottable','cafetable2','cafetable4')) t where num=(p_data->>'number')::integer;
   if target is null then raise exception 'table missing'; end if;
  elsif p_data->>'service'<>'pickup' then raise exception 'bad service'; end if;
  n:=0;
  foreach food in array foods loop
   if not food=any(allowed) then raise exception 'not on menu'; end if;
   insert into public.mall_food(venue,item,buyer,batch,ordinal,furniture) values(p_venue,food,auth.uid(),token,n,target); n:=n+1;
  end loop;
  return jsonb_build_object('accepted',true);
 elsif p_action='put' then
  token:=(p_data->>'token')::uuid; target:=p_data->>'table'; food:=p_data->>'item';
  if token is null or not food=any(allowed) then raise exception 'invalid food'; end if;
  if exists(select 1 from public.mall_food where batch=token and buyer=auth.uid() and venue=p_venue) then return jsonb_build_object('accepted',true); end if;
  if not exists(select 1 from jsonb_array_elements(entries) e where e->>'id'=target and split_part(target,'#',1) in ('malltable','mallhotpottable','cafetable2','cafetable4')) then return jsonb_build_object('accepted',false); end if;
  capacity:=case split_part(target,'#',1) when 'cafetable2' then 2 else 4 end;
  select x into spot from generate_series(0,capacity-1) x where not exists(select 1 from public.mall_food f where f.venue=p_venue and f.furniture=target and f.slot=x and f.state in ('table','pot')) order by x limit 1;
  if spot is null then return jsonb_build_object('accepted',false); end if;
  insert into public.mall_food(id,venue,item,buyer,batch,state,furniture,slot,ready_at) values(token,p_venue,food,auth.uid(),token,'table',target,spot,now());
  return jsonb_build_object('accepted',true);
 elsif p_action='pot' then
  if p_venue<>'mallhotpot' then raise exception 'not a hotpot room'; end if;
  pot:=p_data->>'pot';
  if not exists(select 1 from jsonb_array_elements(entries) e where e->>'id'=pot and split_part(pot,'#',1)='mallpot') then raise exception 'pot missing'; end if;
  select * into rec from public.mall_food where id=(p_data->>'id')::uuid and venue=p_venue and state='table' for update;
  if not found or rec.item not like 'hotpot%' then raise exception 'ingredient missing'; end if;
  select x into spot from generate_series(0,5) x where not exists(select 1 from public.mall_food f where f.venue=p_venue and f.furniture=pot and f.slot=x and f.state='pot') order by x limit 1;
  if spot is null then raise exception 'pot full'; end if;
  update public.mall_food set state='pot',furniture=pot,slot=spot where id=rec.id;
  return jsonb_build_object('accepted',true);
 elsif p_action='pick' then
  select * into rec from public.mall_food where id=(p_data->>'id')::uuid and venue=p_venue and state in ('counter','table','pot') for update;
  if not found then return 'null'::jsonb; end if;
  if rec.state='counter' and rec.id not in(select id from public.mall_food where venue=p_venue and state='counter' order by created_at,id limit 2) then return 'null'::jsonb; end if;
  update public.mall_food set state='taken' where id=rec.id;
  return to_jsonb(rec.item);
 elsif p_action<>'refresh' then raise exception 'unknown action'; end if;
 for rec in select * from public.mall_food where venue=p_venue and state='waiting' and ready_at<=now() order by created_at,id limit 48 for update loop
  if rec.furniture is null or not exists(select 1 from jsonb_array_elements(entries) e where e->>'id'=rec.furniture and split_part(e->>'id','#',1) in ('malltable','mallhotpottable','cafetable2','cafetable4')) then
   update public.mall_food set state='counter',furniture=null where id=rec.id;
  else
   capacity:=case split_part(rec.furniture,'#',1) when 'cafetable2' then 2 else 4 end;
   select x into spot from generate_series(0,capacity-1) x where not exists(select 1 from public.mall_food f where f.venue=p_venue and f.furniture=rec.furniture and f.slot=x and f.state in ('table','pot')) order by x limit 1;
   if spot is not null then update public.mall_food set state='table',slot=spot,delivered_at=now() where id=rec.id; end if;
  end if;
 end loop;
 return jsonb_build_object('ready',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,item from public.mall_food where venue=p_venue and state='counter' order by created_at,id limit 2)q),
 'waiting',(select count(*) from public.mall_food where venue=p_venue and state in ('waiting','counter')),
 'tables',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'item',item,'furniture',furniture,'slot',slot,'state',state,'deliveredAt',delivered_at)),'[]'::jsonb) from public.mall_food where venue=p_venue and state in ('table','pot')));
end $$;
revoke all on function mall_private.action(text,text,jsonb) from public,anon;
grant execute on function mall_private.action(text,text,jsonb) to authenticated;
create function public.mall_action(p_action text,p_venue text,p_data jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select mall_private.action(p_action,p_venue,p_data); $$;
revoke all on function public.mall_action(text,text,jsonb) from public,anon;
grant execute on function public.mall_action(text,text,jsonb) to authenticated;
-- Only widen existing allowlists. Preserve admin and friend authorization checks.
DO $change$ declare src text; begin
 select pg_get_functiondef('public.put_place(text,jsonb)'::regprocedure) into src;
 execute replace(src,'''cinema'', ''cafe''','''cinema'', ''cafe'', ''mall''');
 select pg_get_functiondef('public.can_use_house(text)'::regprocedure) into src;
 execute replace(src,'''place:cinema'', ''place:cafe''','''place:cinema'', ''place:cafe'', ''place:mall''');
end $change$;
