-- v140: owner-approved table-service queue. Existing pickup orders are unchanged.
create table public.cafe_delivery_orders (
  id uuid primary key default gen_random_uuid(),
  item text not null check (item in ('croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','wrap','tart','cookies','bottledwater','coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha')),
  buyer uuid not null,
  furniture text not null,
  created_at timestamptz not null default now(),
  ready_at timestamptz not null default (now() + interval '3 seconds'),
  delivered_at timestamptz,
  destination text check (destination in ('table','counter'))
);
alter table public.cafe_delivery_orders enable row level security;
revoke all on public.cafe_delivery_orders from public,anon,authenticated;
create index cafe_delivery_waiting_idx on public.cafe_delivery_orders(created_at) where delivered_at is null;

create function cafe_private.place_table_order(p_items text[],p_number integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare target text; it text;
begin
  if auth.uid() is null then raise exception 'signed out'; end if;
  if p_items is null or cardinality(p_items)<1 or cardinality(p_items)>12 or array_ndims(p_items)<>1 or p_number is null or p_number<1 then raise exception 'bad order'; end if;
  select id into target from (
    select e->>'id' as id, row_number() over(order by (e->>'id') collate "C") as num
    from public.public_places p, jsonb_each(p.layout->'rooms') r, jsonb_array_elements(r.value) e
    where p.key='cafe' and split_part(e->>'id','#',1) in ('cafetable2','cafetable4')
  ) t where num=p_number;
  if target is null then raise exception 'table not found'; end if;
  foreach it in array p_items loop
    insert into public.cafe_delivery_orders(item,buyer,furniture) values(it,auth.uid(),target);
  end loop;
  return cardinality(p_items);
end $$;

create function cafe_private.service_tables() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.cafe_delivery_orders; room_key text; capacity integer; spot integer;
begin
  if auth.uid() is null then raise exception 'signed out'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cafe-delivery-queue',0));
  for o in select * from public.cafe_delivery_orders where delivered_at is null and ready_at<=now() order by created_at,id limit 48 for update skip locked loop
    select r.key into room_key from public.public_places p, jsonb_each(p.layout->'rooms') r, jsonb_array_elements(r.value) e
      where p.key='cafe' and e->>'id'=o.furniture limit 1;
    if room_key is null then
      insert into public.cafe_orders(item,buyer,ready_at) values(o.item,o.buyer,now());
      update public.cafe_delivery_orders set delivered_at=now(),destination='counter' where id=o.id;
      continue;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(o.furniture,0));
    capacity := case split_part(o.furniture,'#',1) when 'cafetable2' then 2 when 'cafetable4' then 4 else 0 end;
    select x into spot from generate_series(0,capacity-1) x where not exists(select 1 from public.cafe_table_items where furniture=o.furniture and slot=x and picked_by is null) order by x limit 1;
    if spot is null then continue; end if;
    insert into public.cafe_table_items(id,item,room,furniture,slot,placed_by) values(o.id,o.item,room_key,o.furniture,spot,o.buyer);
    update public.cafe_delivery_orders set delivered_at=now(),destination='table' where id=o.id;
  end loop;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'item',t.item,'room',t.room,'furniture',t.furniture,'slot',t.slot,'deliveredAt',d.delivered_at) order by t.created_at),'[]'::jsonb)
    from public.cafe_table_items t left join public.cafe_delivery_orders d on d.id=t.id where t.picked_by is null);
end $$;
revoke all on function cafe_private.place_table_order(text[],integer), cafe_private.service_tables() from public,anon;
grant execute on function cafe_private.place_table_order(text[],integer), cafe_private.service_tables() to authenticated;
create function public.place_cafe_table_order(p_items text[],p_number integer) returns integer
language sql security invoker set search_path = '' as $$ select cafe_private.place_table_order(p_items,p_number); $$;
create function public.cafe_service_tables_now() returns jsonb
language sql security invoker set search_path = '' as $$ select cafe_private.service_tables(); $$;
revoke all on function public.place_cafe_table_order(text[],integer), public.cafe_service_tables_now() from public,anon;
grant execute on function public.place_cafe_table_order(text[],integer), public.cafe_service_tables_now() to authenticated;
