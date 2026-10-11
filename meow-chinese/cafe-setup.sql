-- v132: separate cafe orders. Run once, with the owner's approval.
-- No existing table, row, cinema function, auth table or friend data is changed.
create schema cafe_private;
revoke all on schema cafe_private from public;
grant usage on schema cafe_private to authenticated;

create table public.cafe_orders (
  id bigint generated always as identity primary key,
  item text not null check (item in ('croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','wrap','tart','cookies','bottledwater','coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha')),
  buyer uuid not null,
  created_at timestamptz not null default now(),
  ready_at timestamptz not null default (now() + interval '3 seconds'),
  picked_by uuid,
  picked_at timestamptz
);
alter table public.cafe_orders enable row level security;
revoke all on public.cafe_orders from public, anon, authenticated;
revoke all on sequence public.cafe_orders_id_seq from public, anon, authenticated;
create index cafe_orders_waiting_idx on public.cafe_orders (id) where picked_by is null;
-- Orders are accessible only through the signed-in functions below, never by direct table writes.

create function cafe_private.place_order(p_items text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare it text; n integer := 0;
begin
  if auth.uid() is null then raise exception 'signed out'; end if;
  if p_items is null or cardinality(p_items) < 1 or cardinality(p_items) > 12 or array_ndims(p_items) <> 1 then raise exception 'bad order'; end if;
  foreach it in array p_items loop
    if it is null or it not in ('croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','wrap','tart','cookies','bottledwater','coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha') then raise exception 'unknown item'; end if;
    insert into public.cafe_orders(item,buyer) values (it,auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;
create function cafe_private.counter() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ready', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'item',o.item) order by o.id)
      from (select id,item,ready_at from public.cafe_orders where picked_by is null and created_at > now() - interval '3 hours' order by id limit 2) o
      where o.ready_at <= now()), '[]'::jsonb),
    'waiting', (select count(*) from public.cafe_orders where picked_by is null and created_at > now() - interval '3 hours')
  ) where auth.uid() is not null;
$$;
create function cafe_private.pick_order(p_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare got text;
begin
  if auth.uid() is null then return null; end if;
  update public.cafe_orders set picked_by=auth.uid(),picked_at=now()
   where id=p_id and picked_by is null and ready_at<=now()
     and id in (select id from public.cafe_orders where picked_by is null and created_at > now() - interval '3 hours' order by id limit 2)
  returning item into got;
  return got;
end $$;
revoke all on function cafe_private.place_order(text[]), cafe_private.counter(), cafe_private.pick_order(bigint) from public, anon;
grant execute on function cafe_private.place_order(text[]), cafe_private.counter(), cafe_private.pick_order(bigint) to authenticated;

-- Public REST entry points use invoker privileges; protected implementation stays private.
create function public.place_cafe_order(p_items text[]) returns integer
language sql security invoker set search_path = '' as $$ select cafe_private.place_order(p_items); $$;
create function public.cafe_counter() returns jsonb
language sql stable security invoker set search_path = '' as $$ select cafe_private.counter(); $$;
create function public.pick_cafe_order(p_id bigint) returns text
language sql security invoker set search_path = '' as $$ select cafe_private.pick_order(p_id); $$;
revoke all on function public.place_cafe_order(text[]), public.cafe_counter(), public.pick_cafe_order(bigint) from public, anon;
grant execute on function public.place_cafe_order(text[]), public.cafe_counter(), public.pick_cafe_order(bigint) to authenticated;

-- Shared tabletop food. Collected rows are retained; no visitor can edit furniture or decorative food.
create table public.cafe_table_items (
  id uuid primary key,
  item text not null,
  room text not null,
  furniture text not null,
  slot integer not null check (slot between 0 and 3),
  placed_by uuid not null,
  created_at timestamptz not null default now(),
  picked_by uuid,
  picked_at timestamptz
);
alter table public.cafe_table_items enable row level security;
revoke all on public.cafe_table_items from public, anon, authenticated;
create unique index cafe_table_items_slot_idx on public.cafe_table_items(furniture,slot) where picked_by is null;
create function cafe_private.table_items() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'item',item,'room',room,'furniture',furniture,'slot',slot) order by created_at),'[]'::jsonb)
  from public.cafe_table_items where picked_by is null and auth.uid() is not null;
$$;
create function cafe_private.put_table_item(p_token uuid,p_item text,p_room text,p_table text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prev public.cafe_table_items; spot integer; capacity integer; saved jsonb; allowed text[] := array['popsweet','popsalty','popmix','coke','sprite','coffee','tea','bubbletea','rootbeer','sevenup','cokefloat','icecone','icecup','nachos','sausagebun','chips','kacang','bottledwater','croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','wrap','tart','cookies','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha'];
begin
  if auth.uid() is null then raise exception 'signed out'; end if;
  if p_token is null or p_item is null or not(p_item=any(allowed)) or p_table is null or p_room is null then return jsonb_build_object('accepted',false,'reason','invalid'); end if;
  -- The same request can be safely retried after a lost connection, even if someone already collected it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_table,0));
  select * into prev from public.cafe_table_items where id=p_token;
  if found then
    return jsonb_build_object('accepted',prev.placed_by=auth.uid() and prev.item=p_item and prev.room=p_room and prev.furniture=p_table);
  end if;
  select layout into saved from public.public_places where key='cafe';
  if not exists(select 1 from jsonb_array_elements(coalesce(saved->'rooms'->p_room,'[]'::jsonb)) e where e->>'id'=p_table) then return jsonb_build_object('accepted',false,'reason','moved'); end if;
  capacity := case split_part(p_table,'#',1) when 'cafetable2' then 2 when 'cafetable4' then 4 else 0 end;
  select x into spot from generate_series(0,capacity-1) x where not exists(select 1 from public.cafe_table_items where furniture=p_table and slot=x and picked_by is null) order by x limit 1;
  if spot is null then return jsonb_build_object('accepted',false,'reason','full'); end if;
  insert into public.cafe_table_items(id,item,room,furniture,slot,placed_by) values(p_token,p_item,p_room,p_table,spot,auth.uid());
  return jsonb_build_object('accepted',true);
end $$;
create function cafe_private.pick_table_item(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare got text;
begin
  if auth.uid() is null then return null; end if;
  update public.cafe_table_items set picked_by=auth.uid(),picked_at=now() where id=p_id and picked_by is null returning item into got;
  return got;
end $$;
revoke all on function cafe_private.table_items(), cafe_private.put_table_item(uuid,text,text,text), cafe_private.pick_table_item(uuid) from public,anon;
grant execute on function cafe_private.table_items(), cafe_private.put_table_item(uuid,text,text,text), cafe_private.pick_table_item(uuid) to authenticated;
create function public.cafe_table_items_now() returns jsonb language sql stable security invoker set search_path = '' as $$ select cafe_private.table_items(); $$;
create function public.put_cafe_table_item(p_token uuid,p_item text,p_room text,p_table text) returns jsonb language sql security invoker set search_path = '' as $$ select cafe_private.put_table_item(p_token,p_item,p_room,p_table); $$;
create function public.pick_cafe_table_item(p_id uuid) returns text language sql security invoker set search_path = '' as $$ select cafe_private.pick_table_item(p_id); $$;
revoke all on function public.cafe_table_items_now(), public.put_cafe_table_item(uuid,text,text,text), public.pick_cafe_table_item(uuid) from public,anon;
grant execute on function public.cafe_table_items_now(), public.put_cafe_table_item(uuid,text,text,text), public.pick_cafe_table_item(uuid) to authenticated;

-- Add the furnished cafe only if it does not exist; never overwrite an owner's layout.
insert into public.public_places(key,layout) values ('cafe', '{"rooms":{"cafedining1":[],"cafemain":[],"cafedining2":[],"cafetoilet":[],"cafekitchen":[],"cafeentrance":[]},"open":["cafedining1","cafemain","cafedining2","cafetoilet","cafekitchen","cafeentrance"],"power":{"dark":{},"off":{}},"styles":{}}'::jsonb) on conflict (key) do nothing;
