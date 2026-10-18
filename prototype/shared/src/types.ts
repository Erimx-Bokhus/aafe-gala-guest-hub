// Types mirror database/schema.sql one-to-one (snake_case kept on purpose so a
// Supabase client can return rows straight into these shapes).

export type Role = 'gala_admin' | 'relationship_manager' | 'check_in_volunteer'
export type OrderSource = 'givelively' | 'check' | 'ach_direct' | 'wire' | 'comp' | 'staff_entry'
export type OrderStatus = 'pledged' | 'partially_paid' | 'paid' | 'comp' | 'invoice_sent' | 'cancelled'
export type Material = 'not_required' | 'pending' | 'received' | 'approved'
export type PayMethod = 'card' | 'amex' | 'givelively_ach' | 'check' | 'ach_direct' | 'wire'
export type SeatStatus = 'unnamed' | 'submitted' | 'reviewed' | 'badge_ready' | 'checked_in' | 'cancelled'
export type BadgeStatus = 'needs_review' | 'ready' | 'printed' | 'reprint_needed'
// AAFE's seven guest categories (requirements); the Full demo data sets use all of them.
export type GuestType = 'sponsor_guest' | 'ticket_holder' | 'comp_relationship' | 'government_vip' | 'aafe_staff' | 'event_volunteer' | 'event_staff'

export interface GalaEvent { id: string; year: number; name: string; event_date: string; doors_time: string; program_time: string; venue_name: string; venue_address: string; dress_code: string; guest_list_deadline: string; program_ad_deadline: string; status: 'planning' | 'live' | 'closed'; is_synthetic: boolean; /** Sponsors see which of their guests have arrived (off until AAFE approves). */ sponsor_arrivals_visible?: boolean; /** Who at AAFE approved it, and when. */ sponsor_arrivals_note?: string | null; /** This gala's Give Lively page; only its purchases are imported. */ givelively_page_name?: string | null; /** Its other Give Lively pages, such as a private Community Tickets page. */ givelively_other_pages?: string[]; /** The sponsorship goal the pipeline board measures against. */ sponsorship_goal?: number | null }
export interface StaffUser { id: string; name: string; email: string; role: Role }
export interface Tier { id: string; name: string; contribution_amount: number; included_seat_count: number; tier_category: 'sponsorship' | 'ticket' | 'advertising_only' | 'complimentary'; required_materials: string[]
  /** The gala this level belongs to: each gala has its own levels (decided Oct 14). */ event_id?: string | null; sort_order?: number; retired?: boolean; guaranteed_seating?: boolean }
export interface Sponsor { id: string; organization_name: string; primary_contact_name: string; primary_contact_email: string; phone: string; relationship_owner_id: string; salesforce_account_id: string | null; created_at: string }
export interface Order { id: string; event_id: string; sponsor_id: string; tier_id: string; source: OrderSource; commitment_amount: number; status: OrderStatus; portal_token: string | null; portal_token_expires_at: string | null; portal_link_sent_at: string | null; guest_list_deadline: string | null; logo_status: Material; program_ad_status: Material; givelively_order_ref: string | null; salesforce_opportunity_id: string | null; internal_notes: string; /** The Give Lively page it was bought on (null: imported before Oct 15). */ givelively_page?: string | null; created_at: string; updated_at: string }
export interface Payment { id: string; order_id: string; method: PayMethod; processor: 'stripe' | 'none'; givelively_transaction_id: string | null; check_number: string | null; original_amount: number; covered_fee_amount: number; gross_amount: number; /** Null: not known yet (AAFE's ticket export has no fee column; the sync fills it in). */ transaction_fee_amount: number | null; refunded_amount: number; /** Null while the fee is unknown. */ net_amount: number | null; /** The wallet behind a card payment: Apple Pay, Google Pay, PayPal, Venmo, Donor-advised fund. */ method_detail?: string | null; received_at: string; recorded_by: string; reconciliation_status: 'unreconciled' | 'matched' | 'needs_review'; salesforce_opportunity_id: string | null; /** Give Lively purchases: buyer email + purchase time, how a re-import recognizes them. */ purchase_key?: string | null }
export interface EventTable { id: string; event_id: string; number: number; label: string | null; capacity: number; pos_x: number; pos_y: number }
export interface Guest { id: string; order_id: string; first_name: string; last_name: string; /** The guest's name as written, printed everywhere; first and last are for sorting (import-engine/src/names.ts). */ display_name?: string | null; title: string; organization: string; email: string; dietary_needs: string | null; accessibility_needs: string | null; guest_type: GuestType; relationship_note: string | null; table_id: string | null; seat_number: number | null; badge_status: BadgeStatus; attendance_status: 'expected' | 'checked_in' | 'no_show'; qr_token: string | null; last_updated_by: 'guest_portal' | 'staff' | 'givelively_sync'; created_at: string; updated_at: string }
export interface Seat { id: string; order_id: string; slot_number: number; guest_id: string | null; status: SeatStatus; updated_at: string }
export interface CheckIn { id: string; event_id: string; guest_id: string | null; order_id: string | null; arrival_name: string | null; method: 'qr' | 'search' | 'exception'; type: string; checked_in_by: string; note: string; checked_in_at: string; source?: string; device?: string | null; received_at?: string }
export interface EmailLog { id: string; template: 'portal_link' | 'qr_invitation' | 'guest_list_reminder' | 'payment_receipt'; to_email: string; to_name: string; order_id: string | null; guest_id: string | null; trigger: string; status: 'queued' | 'sent' | 'opened' | 'bounced' | 'cancelled'; sent_at: string | null; approved_by?: string | null; approved_at?: string | null }
export interface AuditEntry { id: number; at: string; actor_type: 'guest_portal' | 'staff' | 'system'; actor: string; entity: string; entity_id: string; order_id: string | null; action: string; from_state: string | null; to_state: string | null; guest_visible: boolean; summary: string }
export interface SfSync { entity: string; entity_id: string; sf_object: string; sf_id: string | null; status: 'pending' | 'synced' | 'error'; last_synced_at: string | null; error_message: string | null }

export type ReviewReason = 'unknown_tier' | 'guest_text_changed' | 'email_name_conflict' | 'double_booked' | 'possible_duplicate' | 'refund' | 'missing_from_source' | 'zero_amount' | 'disputed'
export interface ImportRun { id: string; event_id: string; source: 'csv' | 'sync'; file_name: string | null; file_hash: string | null; started_by: string; started_at: string; finished_at: string | null; status: 'running' | 'succeeded' | 'failed'; earliest_purchase: string | null; latest_purchase: string | null; counts: Record<string, number> | null; report: unknown }
export interface ImportReview { id: string; run_id: string | null; event_id: string; purchase_key: string | null; order_id: string | null; reason: ReviewReason; details: Record<string, unknown>; status: 'open' | 'resolved'; resolution: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string }
export interface TierMappingRow { id: string; event_id: string; givelively_name: string; name_key: string; /** name_key of one of the gala's other pages; '' or missing: its main page. */ page_key?: string; tier_id: string; created_by: string; created_at: string }
export type PipelineStage = 'not_started' | 'reached_out' | 'in_conversation' | 'closed_won' | 'payment_received' | 'lost'
export type Sector = 'board' | 'community' | 'corporate' | 'foundation' | 'individual' | 'small_business'
export interface Prospect { id: string; event_id: string; sponsor_id: string; stage: PipelineStage; sector: Sector | null; ask_amount: number | null; ask_tier_id: string | null; order_id: string | null; follow_up_owner_id: string | null; notes: string | null; stage_changed_at: string; created_at: string; updated_at: string; /** Demo only: the order status the stage last followed, so a stage staff set holds until the order changes (as the trigger does). */ seen_status?: string | null }
export interface DB {
  meta: { current_event_id: string; fee_rates: Record<string, string>; fee_source: string }
  gala_events: GalaEvent[]; staff_users: StaffUser[]; sponsorship_tiers: Tier[]; sponsors: Sponsor[]; orders: Order[]
  payments: Payment[]; event_tables: EventTable[]; guests: Guest[]; seats: Seat[]; check_ins: CheckIn[]
  email_log: EmailLog[]; audit_log: AuditEntry[]; salesforce_sync: SfSync[]
  /** The Give Lively import's own tables (backend.sql): uploads, close calls for staff, and tier names linked to packages. */
  import_runs?: ImportRun[]; import_review?: ImportReview[]; tier_mappings?: TierMappingRow[]
  /** AAFE's prospect tracker (backend.sql sponsor_prospects). */
  sponsor_prospects?: Prospect[]
}
