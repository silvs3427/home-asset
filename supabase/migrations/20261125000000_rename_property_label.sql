-- Home-wide rename for user-defined category / document-type labels.
-- Cascades to assets.category or documents.doc_type on the same home.
-- Security definer; only the homeowner (owns_property / auth.uid()) may rename.
-- Phone calls this RPC after the homeowner confirms the new name — no silent renames.

create or replace function public.rename_property_label(
  p_property_id uuid,
  p_kind text,
  p_old_value text,
  p_new_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := trim(p_kind);
  v_old text := trim(regexp_replace(coalesce(p_old_value, ''), '\s+', ' ', 'g'));
  v_new text := trim(regexp_replace(coalesce(p_new_value, ''), '\s+', ' ', 'g'));
  v_old_key text;
  v_new_key text;
  v_now timestamptz := now();
  v_old_id uuid;
  v_new_id uuid;
  v_assets int := 0;
  v_docs int := 0;
  v_label public.property_labels%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.owns_property(p_property_id) then
    raise exception 'property_not_found' using errcode = 'P0002';
  end if;
  if v_kind not in ('asset_category', 'document_type') then
    raise exception 'invalid_label_kind' using errcode = '22023';
  end if;
  if v_old = '' or v_new = '' then
    raise exception 'empty_label' using errcode = '22023';
  end if;
  if char_length(v_new) > 80 then
    raise exception 'label_too_long' using errcode = '22023';
  end if;

  v_old_key := lower(v_old);
  v_new_key := lower(v_new);

  select id into v_old_id
  from public.property_labels
  where property_id = p_property_id
    and kind = v_kind
    and value_key = v_old_key;

  -- Ensure an old label row exists (create from assets/docs if missing).
  if v_old_id is null then
    insert into public.property_labels (property_id, kind, value, created_at, updated_at)
    values (p_property_id, v_kind, v_old, v_now, v_now)
    on conflict (property_id, kind, value_key) do update
      set updated_at = excluded.updated_at
    returning id into v_old_id;
  end if;

  if v_kind = 'asset_category' then
    update public.assets
    set category = v_new,
        updated_at = v_now
    where property_id = p_property_id
      and lower(trim(category)) = v_old_key;
    get diagnostics v_assets = row_count;
  else
    update public.documents
    set doc_type = v_new,
        updated_at = v_now
    where property_id = p_property_id
      and lower(trim(doc_type)) = v_old_key;
    get diagnostics v_docs = row_count;
  end if;

  if v_old_key = v_new_key then
    -- Casing-only rename.
    update public.property_labels
    set value = v_new,
        updated_at = v_now
    where id = v_old_id
    returning * into v_label;
  else
    select id into v_new_id
    from public.property_labels
    where property_id = p_property_id
      and kind = v_kind
      and value_key = v_new_key;

    if v_new_id is not null then
      -- Merge into existing target label; drop the old name chip.
      update public.property_labels
      set value = v_new,
          updated_at = v_now
      where id = v_new_id
      returning * into v_label;
      delete from public.property_labels where id = v_old_id;
    else
      update public.property_labels
      set value = v_new,
          updated_at = v_now
      where id = v_old_id
      returning * into v_label;
    end if;
  end if;

  return jsonb_build_object(
    'label', jsonb_build_object(
      'id', v_label.id,
      'value', v_label.value,
      'kind', v_label.kind,
      'createdAt', v_label.created_at,
      'updatedAt', v_label.updated_at
    ),
    'updatedAssets', v_assets,
    'updatedDocuments', v_docs,
    'privacy', jsonb_build_object(
      'writes', true,
      'confirmedByUser', true,
      'note', 'Renamed only because you confirmed. Home-scoped; no silent renames.'
    )
  );
end;
$$;

revoke all on function public.rename_property_label(uuid, text, text, text) from public;
grant execute on function public.rename_property_label(uuid, text, text, text) to authenticated;

comment on function public.rename_property_label(uuid, text, text, text) is
  'Homeowner-confirmed rename of a per-home category or document-type label; cascades to assets/documents on that home only.';
