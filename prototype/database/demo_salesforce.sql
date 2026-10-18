-- =====================================================================
-- DEMO ONLY: a stand-in Salesforce org. All data is synthetic.
-- The salesforce-mock edge function answers SOQL queries and sObject Collections calls the way Salesforce's REST API
-- does, so salesforce-push runs unchanged; the records land here. Run after backend.sql. Do not run in a real AAFE project.
-- =====================================================================

create table if not exists demo_salesforce_records (
  sf_id        text primary key,           -- the 18-character-style id Salesforce gives it
  sobject      text not null,              -- 'Campaign', 'Account', 'Opportunity', 'npe01__OppPayment__c', 'Contact', 'CampaignMember'
  external_id  text,                       -- AAFE_Gala_Id__c: our id; none on records we didn't make (Give Lively's, AAFE's own)
  fields       jsonb not null,
  updated_at   timestamptz not null default now(),
  unique (sobject, external_id)
);
alter table demo_salesforce_records enable row level security;   -- no policies: edge functions only
-- Oct 18 (Gate 1, box 5): the stand-in holds Give Lively's records too, which carry no id of ours; it was keyed on it.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'demo_salesforce_records_pkey'
              and pg_get_constraintdef(oid) like '%sobject, external_id%') then
    alter table demo_salesforce_records drop constraint demo_salesforce_records_pkey;
    alter table demo_salesforce_records alter column external_id drop not null;
    alter table demo_salesforce_records add primary key (sf_id);
    alter table demo_salesforce_records add unique (sobject, external_id);
  end if;
end $$;

-- A record as a query returns it: its fields, with Id and LastModifiedDate as Salesforce adds them.
create or replace function demo_salesforce_row(d demo_salesforce_records) returns jsonb
language sql immutable set search_path = public as $$
  select d.fields || jsonb_build_object('Id', d.sf_id, 'LastModifiedDate', d.updated_at)
$$;

-- One SOQL query, as salesforce-mock/soql.ts read it: the rows of p_sobject where any (p_any) or every condition
-- {field, values} holds, comparing text without case as SOQL does -> [{attributes, <each field asked for>}].
create or replace function demo_salesforce_query(p_sobject text, p_fields text[], p_any boolean, p_conds jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('attributes', jsonb_build_object('type', p_sobject))
                            || (select jsonb_object_agg(f, demo_salesforce_row(d) -> f) from unnest(p_fields) f) order by d.sf_id), '[]')
  from demo_salesforce_records d
  where d.sobject = p_sobject
    and (select case when p_any then bool_or(m) else bool_and(m) end from (
           select coalesce(lower(demo_salesforce_row(d) ->> (c ->> 'field')) in (select lower(v) from jsonb_array_elements_text(c -> 'values') v), false) m
           from jsonb_array_elements(p_conds) c) x)
$$;

-- An sObject Collections create (p_op 'create') or update by Id ('update'): [{attributes, ...}] ->
-- [{id, success, errors}], one per record, in order. Like Salesforce: a Campaign Member needs its Campaign and
-- Contact, a Contact is in a Campaign once, and a member's Campaign and Contact can't change.
create or replace function demo_salesforce_save(p_op text, p_records jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_out jsonb := '[]'; v_type text; v_id text; v_code text; v_msg text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    v_type := r #>> '{attributes,type}'; v_code := null;
    if p_op = 'update' then
      select sf_id into v_id from demo_salesforce_records where sobject = v_type and sf_id = r ->> 'Id';
      if v_id is null then v_code := 'INVALID_ID_FIELD'; v_msg := 'invalid record id';
      elsif v_type = 'CampaignMember' and (r ? 'CampaignId' or r ? 'ContactId') then
        v_code := 'INVALID_FIELD_FOR_INSERT_UPDATE'; v_msg := 'Unable to create/update fields: CampaignId, ContactId';
      else
        update demo_salesforce_records set fields = fields || (r - 'attributes' - 'Id'), updated_at = now() where sf_id = v_id;
      end if;
    else
      v_id := case v_type when 'Account' then '001' when 'Contact' then '003' when 'Opportunity' then '006' when 'Campaign' then '701'
                          when 'CampaignMember' then '00v' else 'a01' end || 'MOCK' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 11));
      if v_type = 'CampaignMember' and not (exists (select 1 from demo_salesforce_records where sobject = 'Campaign' and sf_id = r ->> 'CampaignId')
                                            and exists (select 1 from demo_salesforce_records where sobject = 'Contact' and sf_id = r ->> 'ContactId')) then
        v_code := 'INVALID_CROSS_REFERENCE_KEY'; v_msg := 'invalid cross reference id';
      elsif v_type = 'CampaignMember' and exists (select 1 from demo_salesforce_records where sobject = 'CampaignMember'
                                                   and fields ->> 'CampaignId' = r ->> 'CampaignId' and fields ->> 'ContactId' = r ->> 'ContactId') then
        v_code := 'DUPLICATE_VALUE'; v_msg := 'Already a campaign member.';
      elsif exists (select 1 from demo_salesforce_records where sobject = v_type and external_id = r ->> 'AAFE_Gala_Id__c') then
        v_code := 'DUPLICATE_VALUE'; v_msg := 'duplicate value found: AAFE_Gala_Id__c';
      else
        insert into demo_salesforce_records (sf_id, sobject, external_id, fields) values (v_id, v_type, nullif(r ->> 'AAFE_Gala_Id__c', ''), r - 'attributes');
      end if;
    end if;
    v_out := v_out || jsonb_build_array(case when v_code is null then jsonb_build_object('id', v_id, 'success', true, 'errors', '[]'::jsonb)
      else jsonb_build_object('success', false, 'errors', jsonb_build_array(jsonb_build_object('statusCode', v_code, 'message', v_msg))) end);
  end loop;
  return v_out;
end $$;

-- One sObject Collections upsert on AAFE_Gala_Id__c: [{attributes, AAFE_Gala_Id__c, ...fields}] ->
-- [{id, success, created, errors}], one answer per record, in order. Like Salesforce, a record whose parent
-- (Account, Campaign, Contact, npe01__Opportunity__r given by external id) doesn't exist yet fails on its own.
create or replace function demo_salesforce_upsert(p_sobject text, p_records jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_out jsonb := '[]'; v_ext text; v_id text; v_new boolean; v_missing text;
  v_prefix text := case p_sobject when 'Account' then '001' when 'Contact' then '003' when 'Opportunity' then '006'
                     when 'Campaign' then '701' when 'CampaignMember' then '00v' else 'a01' end;
begin
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    v_ext := r ->> 'AAFE_Gala_Id__c';
    if coalesce(v_ext, '') = '' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('success', false,
        'errors', jsonb_build_array(jsonb_build_object('statusCode', 'REQUIRED_FIELD_MISSING', 'message', 'AAFE_Gala_Id__c is required'))));
      continue;
    end if;
    -- ponytail: our ids carry their kind (sp-, ord-, g-, ev-), so a parent is found by its id alone, whatever its sObject.
    select string_agg(k, ', ') into v_missing from jsonb_each(r) x(k, v)
     where jsonb_typeof(v) = 'object' and k <> 'attributes' and v ? 'AAFE_Gala_Id__c'
       and not exists (select 1 from demo_salesforce_records d where d.external_id = v ->> 'AAFE_Gala_Id__c');
    if v_missing is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('success', false,
        'errors', jsonb_build_array(jsonb_build_object('statusCode', 'INVALID_FIELD', 'message', 'Foreign key external ID not found: ' || v_missing))));
      continue;
    end if;
    select sf_id into v_id from demo_salesforce_records where sobject = p_sobject and external_id = v_ext;
    v_new := v_id is null;
    v_id := coalesce(v_id, v_prefix || 'MOCK' || upper(substr(md5(p_sobject || ':' || v_ext), 1, 11)));
    insert into demo_salesforce_records (sobject, external_id, sf_id, fields) values (p_sobject, v_ext, v_id, r - 'attributes')
    on conflict (sobject, external_id) do update set fields = demo_salesforce_records.fields || excluded.fields, updated_at = now();   -- fields not sent stay
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'success', true, 'created', v_new, 'errors', '[]'::jsonb));
  end loop;
  return v_out;
end $$;
revoke all on function demo_salesforce_upsert(text, jsonb) from public, anon, authenticated;
revoke all on function demo_salesforce_save(text, jsonb) from public, anon, authenticated;
revoke all on function demo_salesforce_query(text, text[], boolean, jsonb) from public, anon, authenticated;
revoke all on function demo_salesforce_row(demo_salesforce_records) from public, anon, authenticated;
grant execute on function demo_salesforce_upsert(text, jsonb), demo_salesforce_save(text, jsonb),
  demo_salesforce_query(text, text[], boolean, jsonb) to service_role;
