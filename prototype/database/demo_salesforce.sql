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

-- What a new Campaign starts with in Salesforce: two member statuses of its own, Sent and Responded. The gala's
-- (Registered, Attended, No Show) are added by salesforce-push before its first member.
create or replace function demo_salesforce_default_statuses(p_campaign text) returns void
language sql security definer set search_path = public as $$
  insert into demo_salesforce_records (sf_id, sobject, fields)
  select '01YMOCK' || upper(substr(md5(p_campaign || ':' || s.label), 1, 11)), 'CampaignMemberStatus',
         jsonb_build_object('CampaignId', p_campaign, 'Label', s.label, 'HasResponded', s.responded, 'SortOrder', s.n)
  from (values ('Sent', false, 1), ('Responded', true, 2)) s(label, responded, n)
  on conflict (sf_id) do nothing
$$;

-- Is p_status one of the member statuses p_campaign has? Like Salesforce, a member with another status is refused.
create or replace function demo_salesforce_has_status(p_campaign text, p_status text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from demo_salesforce_records where sobject = 'CampaignMemberStatus'
                  and fields ->> 'CampaignId' = p_campaign and lower(fields ->> 'Label') = lower(p_status))
$$;

-- An sObject Collections create (p_op 'create') or update by Id ('update'): [{attributes, ...}] ->
-- [{id, success, errors}], one per record, in order. Like Salesforce: a Campaign Member needs its Campaign and
-- Contact and one of its Campaign's statuses, a Contact is in a Campaign once, a member's Campaign and Contact can't
-- change, and a Campaign has each member status once. An update can set our id (AAFE_Gala_Id__c) on a record.
create or replace function demo_salesforce_save(p_op text, p_records jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_out jsonb := '[]'; v_type text; v_id text; v_code text; v_msg text; v_campaign text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    v_type := r #>> '{attributes,type}'; v_code := null;
    if p_op = 'update' then
      select sf_id, fields ->> 'CampaignId' into v_id, v_campaign from demo_salesforce_records where sobject = v_type and sf_id = r ->> 'Id';
      if v_id is null then v_code := 'INVALID_ID_FIELD'; v_msg := 'invalid record id';
      elsif v_type = 'CampaignMember' and (r ? 'CampaignId' or r ? 'ContactId') then
        v_code := 'INVALID_FIELD_FOR_INSERT_UPDATE'; v_msg := 'Unable to create/update fields: CampaignId, ContactId';
      elsif v_type = 'CampaignMember' and r ? 'Status' and not demo_salesforce_has_status(v_campaign, r ->> 'Status') then
        v_code := 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST'; v_msg := 'Status: bad value for restricted picklist field: ' || (r ->> 'Status');
      elsif coalesce(r ->> 'AAFE_Gala_Id__c', '') <> '' and exists (select 1 from demo_salesforce_records
                                                                  where sobject = v_type and external_id = r ->> 'AAFE_Gala_Id__c' and sf_id <> v_id) then
        v_code := 'DUPLICATE_VALUE'; v_msg := 'duplicate value found: AAFE_Gala_Id__c';
      else
        update demo_salesforce_records set fields = fields || (r - 'attributes' - 'Id'), updated_at = now(),
               external_id = coalesce(nullif(r ->> 'AAFE_Gala_Id__c', ''), external_id) where sf_id = v_id;
      end if;
    else
      v_id := case v_type when 'Account' then '001' when 'Contact' then '003' when 'Opportunity' then '006' when 'Campaign' then '701'
                          when 'CampaignMember' then '00v' when 'CampaignMemberStatus' then '01Y' else 'a01' end
              || 'MOCK' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 11));
      if v_type in ('CampaignMember', 'CampaignMemberStatus') and not exists (select 1 from demo_salesforce_records where sobject = 'Campaign' and sf_id = r ->> 'CampaignId')
         or v_type = 'CampaignMember' and not exists (select 1 from demo_salesforce_records where sobject = 'Contact' and sf_id = r ->> 'ContactId') then
        v_code := 'INVALID_CROSS_REFERENCE_KEY'; v_msg := 'invalid cross reference id';
      elsif v_type = 'CampaignMember' and exists (select 1 from demo_salesforce_records where sobject = 'CampaignMember'
                                                   and fields ->> 'CampaignId' = r ->> 'CampaignId' and fields ->> 'ContactId' = r ->> 'ContactId') then
        v_code := 'DUPLICATE_VALUE'; v_msg := 'Already a campaign member.';
      elsif v_type = 'CampaignMember' and not demo_salesforce_has_status(r ->> 'CampaignId', r ->> 'Status') then
        v_code := 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST'; v_msg := 'Status: bad value for restricted picklist field: ' || coalesce(r ->> 'Status', '');
      elsif v_type = 'CampaignMemberStatus' and demo_salesforce_has_status(r ->> 'CampaignId', r ->> 'Label') then
        v_code := 'DUPLICATE_VALUE'; v_msg := 'duplicate value found: Label';
      elsif exists (select 1 from demo_salesforce_records where sobject = v_type and external_id = r ->> 'AAFE_Gala_Id__c') then
        v_code := 'DUPLICATE_VALUE'; v_msg := 'duplicate value found: AAFE_Gala_Id__c';
      else
        insert into demo_salesforce_records (sf_id, sobject, external_id, fields) values (v_id, v_type, nullif(r ->> 'AAFE_Gala_Id__c', ''), r - 'attributes');
        if v_type = 'Campaign' then perform demo_salesforce_default_statuses(v_id); end if;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(case when v_code is null then jsonb_build_object('id', v_id, 'success', true, 'errors', '[]'::jsonb)
      else jsonb_build_object('success', false, 'errors', jsonb_build_array(jsonb_build_object('statusCode', v_code, 'message', v_msg))) end);
  end loop;
  return v_out;
end $$;

-- One sObject Collections upsert on AAFE_Gala_Id__c: [{attributes, AAFE_Gala_Id__c, ...fields}] ->
-- [{id, success, created, errors}], one answer per record, in order. Like Salesforce, a record whose parent
-- (Account, Campaign, Contact, npe01__Opportunity__r given by external id) doesn't exist yet fails on its own, and a
-- new Campaign gets Salesforce's own member statuses.
-- NPSP's automatic payments, when this session has `set demo_salesforce.npsp_auto_payments = 'on'` (off unless
-- asked; scripts/test-salesforce.mts turns it on): like NPSP, a new Opportunity gets one payment of its own for its
-- whole Amount (paid if Closed Won; none if Closed Lost) unless it says npe01__Do_Not_Automatically_Create_Payment__c.
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
    if v_new and p_sobject = 'Campaign' then perform demo_salesforce_default_statuses(v_id); end if;
    if v_new and p_sobject = 'Opportunity' and current_setting('demo_salesforce.npsp_auto_payments', true) = 'on'
       and coalesce((r ->> 'npe01__Do_Not_Automatically_Create_Payment__c')::boolean, false) = false and r ->> 'StageName' <> 'Closed Lost' then
      insert into demo_salesforce_records (sf_id, sobject, fields) values ('a01NPSP' || upper(substr(md5(v_id), 1, 11)), 'npe01__OppPayment__c',
        jsonb_build_object('npe01__Opportunity__c', v_id, 'npe01__Payment_Amount__c', r -> 'Amount', 'npe01__Paid__c', r ->> 'StageName' = 'Closed Won',
                           'npe01__Payment_Date__c', case when r ->> 'StageName' = 'Closed Won' then r -> 'CloseDate' end, 'npe01__Scheduled_Date__c', r -> 'CloseDate'));
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'success', true, 'created', v_new, 'errors', '[]'::jsonb));
  end loop;
  return v_out;
end $$;
revoke all on function demo_salesforce_upsert(text, jsonb) from public, anon, authenticated;
revoke all on function demo_salesforce_save(text, jsonb) from public, anon, authenticated;
revoke all on function demo_salesforce_query(text, text[], boolean, jsonb) from public, anon, authenticated;
revoke all on function demo_salesforce_row(demo_salesforce_records) from public, anon, authenticated;
revoke all on function demo_salesforce_default_statuses(text) from public, anon, authenticated;
revoke all on function demo_salesforce_has_status(text, text) from public, anon, authenticated;
grant execute on function demo_salesforce_upsert(text, jsonb), demo_salesforce_save(text, jsonb),
  demo_salesforce_query(text, text[], boolean, jsonb) to service_role;
