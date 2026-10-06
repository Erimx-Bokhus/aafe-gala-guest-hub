// Types mirror database/schema.sql one-to-one (snake_case kept on purpose so a
// Supabase client can return rows straight into these shapes).

export type Role = 'gala_admin' | 'relationship_manager' | 'check_in_volunteer'
export type OrderSource = 'givelively' | 'check' | 'ach_direct' | 'wire' | 'comp' | 'staff_entry'
export type OrderStatus = 'pledged' | 'partially_paid' | 'paid' | 'comp' | 'invoice_sent' | 'cancelled'
export type Material = 'not_required' | 'pending' | 'received' | 'approved'
export type PayMethod = 'card' | 'amex' | 'givelively_ach' | 'check' | 'ach_direct' | 'wire'
export type SeatStatus = 'unnamed' | 'submitted' | 'reviewed' | 'badge_ready' | 'checked_in' | 'cancelled'
export type BadgeStatus = 'needs_review' | 'ready' | 'printed' | 'reprint_needed'
export type GuestType = 'sponsor_guest' | 'ticket_holder' | 'comp_relationship'

export interface GalaEvent { id: string; year: number; name: string; event_date: string; doors_time: string; program_time: string; venue_name: string; venue_address: string; dress_code: string; guest_list_deadline: string; program_ad_deadline: string; status: 'planning' | 'live' | 'closed'; is_synthetic: boolean }
export interface StaffUser { id: string; name: string; email: string; role: Role }
export interface Tier { id: string; name: string; contribution_amount: number; included_seat_count: number; tier_category: 'sponsorship' | 'ticket' | 'advertising_only' | 'complimentary'; required_materials: string[] }
export interface Sponsor { id: string; organization_name: string; primary_contact_name: string; primary_contact_email: string; phone: string; relationship_owner_id: string; salesforce_account_id: string | null; created_at: string }
export interface Order { id: string; event_id: string; sponsor_id: string; tier_id: string; source: OrderSource; commitment_amount: number; status: OrderStatus; portal_token: string | null; portal_token_expires_at: string | null; portal_link_sent_at: string | null; guest_list_deadline: string | null; logo_status: Material; program_ad_status: Material; givelively_order_ref: string | null; salesforce_opportunity_id: string | null; internal_notes: string; created_at: string; updated_at: string }
export interface Payment { id: string; order_id: string; method: PayMethod; processor: 'stripe' | 'none'; givelively_transaction_id: string | null; check_number: string | null; original_amount: number; covered_fee_amount: number; gross_amount: number; transaction_fee_amount: number; refunded_amount: number; net_amount: number; received_at: string; recorded_by: string; reconciliation_status: 'unreconciled' | 'matched' | 'needs_review'; salesforce_opportunity_id: string | null }
export interface EventTable { id: string; event_id: string; number: number; label: string | null; capacity: number; pos_x: number; pos_y: number }
export interface Guest { id: string; order_id: string; first_name: string; last_name: string; title: string; organization: string; email: string; dietary_needs: string | null; accessibility_needs: string | null; guest_type: GuestType; relationship_note: string | null; table_id: string | null; seat_number: number | null; badge_status: BadgeStatus; attendance_status: 'expected' | 'checked_in' | 'no_show'; qr_token: string | null; last_updated_by: 'guest_portal' | 'staff' | 'givelively_sync'; created_at: string; updated_at: string }
export interface Seat { id: string; order_id: string; slot_number: number; guest_id: string | null; status: SeatStatus; updated_at: string }
export interface CheckIn { id: string; event_id: string; guest_id: string | null; order_id: string | null; arrival_name: string | null; method: 'qr' | 'search' | 'exception'; type: string; checked_in_by: string; note: string; checked_in_at: string }
export interface EmailLog { id: string; template: 'portal_link' | 'qr_invitation' | 'guest_list_reminder' | 'payment_receipt'; to_email: string; to_name: string; order_id: string | null; guest_id: string | null; trigger: string; status: 'queued' | 'sent' | 'opened' | 'bounced' | 'cancelled'; sent_at: string | null; approved_by?: string | null }
export interface AuditEntry { id: number; at: string; actor_type: 'guest_portal' | 'staff' | 'system'; actor: string; entity: string; entity_id: string; order_id: string | null; action: string; from_state: string | null; to_state: string | null; guest_visible: boolean; summary: string }
export interface SfSync { entity: string; entity_id: string; sf_object: string; sf_id: string | null; status: 'pending' | 'synced' | 'error'; last_synced_at: string | null; error_message: string | null }

export interface DB {
  meta: { current_event_id: string; fee_rates: Record<string, string>; fee_source: string }
  gala_events: GalaEvent[]; staff_users: StaffUser[]; sponsorship_tiers: Tier[]; sponsors: Sponsor[]; orders: Order[]
  payments: Payment[]; event_tables: EventTable[]; guests: Guest[]; seats: Seat[]; check_ins: CheckIn[]
  email_log: EmailLog[]; audit_log: AuditEntry[]; salesforce_sync: SfSync[]
}
