-- v142: owner-approved expansion of cafe menu rules; no rows are changed.
alter table public.cafe_orders drop constraint cafe_orders_item_check;
alter table public.cafe_orders add constraint cafe_orders_item_check check (item in ('croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','wrap','tart','cookies','bottledwater','coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha'));
alter table public.cafe_delivery_orders drop constraint cafe_delivery_orders_item_check;
alter table public.cafe_delivery_orders add constraint cafe_delivery_orders_item_check check (item in ('croissant','painauchocolat','donut','canele','cakeslice','cakeloaf','pancakes','wrap','tart','cookies','bottledwater','coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha'));
do $$
declare signature text; definition text;
begin
  foreach signature in array array['cafe_private.place_order(text[])','cafe_private.put_table_item(uuid,text,text,text)'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if strpos(definition, '''lemonade''')=0 or strpos(definition, '''desserttray''')>0 then raise exception 'Unexpected menu definition: %',signature; end if;
    execute replace(definition, '''lemonade''', '''lemonade'',''desserttray'',''icedmatcha'',''hotmatcha''');
  end loop;
end $$;
