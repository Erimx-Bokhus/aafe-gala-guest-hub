-- =====================================================================
-- DEMO ONLY: fake Give Lively account. All data is synthetic.
-- The givelively-mock edge function serves these rows the way Give Lively's
-- Zapier JSON endpoint would, so givelively-sync can import them.
-- Run after backend.sql. Do not run in a real AAFE project.
-- =====================================================================

create table if not exists demo_givelively_donations (
  transaction_id text primary key,
  payload        jsonb not null,           -- one donation, Give Lively "Line Items" field names
  modified_at    timestamptz not null default now()
);
alter table demo_givelively_donations enable row level security;   -- no policies: edge functions only

-- Builds a donation the way Give Lively reports it: Stripe fee on the gross,
-- no platform fee (https://www.givelively.org/fees-and-disbursement).
create or replace function demo_givelively_purchase(
  p_company text, p_first text, p_last text, p_email text, p_ticket_level text,
  p_amount numeric, p_method text default 'Credit Card', p_quantity int default 1,
  p_donor_covers_fee boolean default false, p_campaign text default 'AAFE Gala 2027'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_txn text := 'GL-DEMO-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
  v_rate numeric; v_fixed numeric; v_cap numeric; v_covered numeric := 0; v_gross numeric; v_fee numeric; v_p jsonb;
begin
  select r, f, c into v_rate, v_fixed, v_cap from (values
    ('amex', 0.035, 0, null), ('bank', 0.008, 0, 5), ('card', 0.022, 0.30, null)) x(k, r, f, c)
   where p_method ~* case k when 'amex' then 'amex|american' when 'bank' then 'bank|ach' else '.' end
   order by case k when 'amex' then 1 when 'bank' then 2 else 3 end limit 1;
  if p_donor_covers_fee then v_covered := round(p_amount * v_rate + v_fixed, 2); end if;
  v_gross := p_amount + v_covered;
  v_fee := round(least(v_gross * v_rate + v_fixed, coalesce(v_cap, 1e12)), 2);
  v_p := jsonb_build_object(
    'transaction_id', v_txn, 'donation_date', now(), 'status', 'succeeded',
    'first_name', p_first, 'last_name', p_last, 'email', p_email, 'company_name', p_company,
    'campaign_name', p_campaign, 'ticket_level', p_ticket_level, 'quantity', p_quantity, 'payment_method', p_method,
    'original_amount', p_amount, 'covered_transaction_fee_amount', v_covered, 'gross_amount', v_gross,
    'transaction_fee_amount', v_fee, 'total_refunded_amount', 0, 'net_amount', v_gross - v_fee);
  insert into demo_givelively_donations (transaction_id, payload) values (v_txn, v_p);
  return v_p;
end $$;
revoke all on function demo_givelively_purchase(text, text, text, text, text, numeric, text, int, boolean, text) from public, anon, authenticated;
grant execute on function demo_givelively_purchase(text, text, text, text, text, numeric, text, int, boolean, text) to service_role;

-- Starting purchases (only added once). The first poll imports these.
do $$
begin
  if not exists (select 1 from demo_givelively_donations) then
    perform demo_givelively_purchase('Lotus Community Bank (synthetic)', 'Hana', 'Kim', 'hana.kim@lotusbank.example.org',
      'Gold — Documentary Screening Sponsor', 25000, 'Credit Card');
    perform demo_givelively_purchase('Harborview Health Partners (synthetic)', 'Marcus', 'Liu', 'marcus.liu@harborview.example.org',
      'Silver — Signature Cocktail Sponsor', 15000, 'Bank (ACH)');
    perform demo_givelively_purchase('', 'Sofia', 'Reyes', 'sofia.reyes@mail.example.org',
      'Community Ticket', 500, 'Credit Card', 2, true);
    -- Not a gala purchase: the sync must ignore it.
    perform demo_givelively_purchase('', 'Tom', 'Park', 'tom.park@mail.example.org',
      'General donation', 100, 'Credit Card', 1, false, 'Year-End Appeal');
  end if;
end $$;
