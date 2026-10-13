-- =====================================================================
-- DEMO ONLY: a stand-in Salesforce org. All data is synthetic.
-- The salesforce-mock edge function answers sObject Collections upserts the way Salesforce's REST API does,
-- so salesforce-push runs unchanged; the records land here. Run after backend.sql. Do not run in a real AAFE project.
-- =====================================================================

create table if not exists demo_salesforce_records (
  sobject      text not null,              -- 'Campaign', 'Account', 'Opportunity', 'npe01__OppPayment__c', 'Contact', 'CampaignMember'
  external_id  text not null,              -- AAFE_Gala_Id__c: our id
  sf_id        text not null unique,       -- the 18-character-style id Salesforce would give it
  fields       jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (sobject, external_id)
);
alter table demo_salesforce_records enable row level security;   -- no policies: edge functions only

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
    on conflict (sobject, external_id) do update set fields = excluded.fields, updated_at = now();
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'success', true, 'created', v_new, 'errors', '[]'::jsonb));
  end loop;
  return v_out;
end $$;
revoke all on function demo_salesforce_upsert(text, jsonb) from public, anon, authenticated;
grant execute on function demo_salesforce_upsert(text, jsonb) to service_role;
