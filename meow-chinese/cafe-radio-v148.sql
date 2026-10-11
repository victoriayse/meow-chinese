-- Signed-in visitors may read only radio files assigned to placed cafe radios.
create or replace function public.can_listen_cafe_radio(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.public_places p,
      lateral jsonb_each(case when jsonb_typeof(p.layout->'radios') = 'object' then p.layout->'radios' else '{}'::jsonb end) r
    where p.key = 'cafe' and r.value->>'path' = p_path
      and exists (
        select 1 from jsonb_each(p.layout->'rooms') room,
          lateral jsonb_array_elements(room.value) item
        where item->>'id' = r.key and split_part(r.key, '#', 1) = 'radio'
      )
  );
$$;
revoke all on function public.can_listen_cafe_radio(text) from public, anon;
grant execute on function public.can_listen_cafe_radio(text) to authenticated;
create policy "radio: cafe visitors listen" on storage.objects for select to authenticated
using (bucket_id = 'radio' and public.can_listen_cafe_radio(name));
