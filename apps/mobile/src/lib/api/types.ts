// Shared TypeScript types mirroring the backend response shapes.
//
// Hand-written to match the Go types. When the backend changes, these must
// change with it. When we introduce codegen from OpenAPI in a later phase,
// this file will be generated.

// ─── Auth ───────────────────────────────────────────────────────────

export interface SessionResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601
  user_id: string;
}

export interface RegisterRequest {
  full_name: string;
  phone_number: string;
  email?: string;
  channel: "sms" | "email";
}

export interface RegisterResponse {
  user_id: string;
  channel: "sms" | "email";
  target: string;
  message: string;
}

export interface VerifyRequest {
  target: string;
  channel: "sms" | "email";
  code: string;
}

export interface SignInRequest {
  identifier: string;
  channel?: "sms" | "email";
}

export interface SignInResponse {
  message: string;
}

export interface User {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  status: "active" | "suspended" | "pending_verification";
}

export interface MeResponse {
  user: User;
}

export interface SessionSummary {
  id: string;
  user_agent?: string;
  ip_address?: string;
  created_at: string;
  last_used_at?: string;
  expires_at: string;
  is_current: boolean;
}

export interface SessionsResponse {
  sessions: SessionSummary[];
}

// The standard error envelope from the backend.
export interface ApiError {
  code: string;
  message: string;
  request_id?: string;
  details?: Array<{ field?: string; code?: string; message: string }>;
}

// ─── Organisations ──────────────────────────────────────────────────

export type OrganisationType =
  | "farmer"
  | "trader"
  | "buyer"
  | "transporter"
  | "warehouse"
  | "inspector"
  | "fleet_owner";

export interface Organisation {
  id: string;
  legal_name: string;
  trading_name?: string;
  organisation_type: OrganisationType;
  primary_phone?: string;
  primary_email?: string;
  verification_status:
    | "not_started"
    | "draft"
    | "submitted"
    | "under_review"
    | "additional_info_required"
    | "verified"
    | "rejected"
    | "suspended";
  status: "active" | "suspended" | "closed";
  created_at: string;
  updated_at: string;
  role?: "owner" | "admin" | "manager" | "member" | "viewer";
}

export interface OrganisationLocation {
  id: string;
  name: string;
  address_line?: string;
  locality?: string;
  state?: string;
  country_code: string;
}

export interface CreateOrganisationRequest {
  legal_name: string;
  trading_name?: string;
  organisation_type: OrganisationType;
  primary_phone?: string;
  primary_email?: string;
  location_name: string;
  address_line?: string;
  locality?: string;
  state?: string;
}

export interface CreateOrganisationResponse {
  organisation: Organisation;
  location: OrganisationLocation;
}

export interface ListOrganisationsResponse {
  organisations: Organisation[] | null;
}

export interface OrganisationTypesResponse {
  types: OrganisationType[];
}

// ─── Transport ──────────────────────────────────────────────────────

export interface TransportRequest {
  id: string;
  reference: string;
  status:
    | "draft"
    | "requested"
    | "assignment_pending"
    | "assigned"
    | "shipper_confirmed"
    | "vehicle_en_route"
    | "at_pickup"
    | "loaded"
    | "in_transit"
    | "at_destination"
    | "delivered"
    | "closed"
    | "cancelled"
    | "failed"
    | "disputed";

  requester_user_id: string;
  requester_org_id: string;
  external_reference?: string;

  cargo_description: string;
  cargo_declared_value: number;
  cargo_currency: string;
  cargo_weight_kg: number;
  cargo_volume_m3?: number;

  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;

  destination_address: string; 

  destination_latitude?: number;
  destination_longitude?: number;
  straight_line_distance_m?: number;

  pickup_window_start: string;
  pickup_window_end: string;

  required_vehicle_type?: string;
  required_min_capacity_kg?: number;

  freight_currency: string;

  requested_at: string;
  created_at: string;
}

export interface TransportTripSummary {
  id: string;
  reference: string;
  status: TransportRequest["status"];
  cargo_description: string;
  cargo_weight_kg: number;
  pickup_address: string;
  destination_address: string;
  straight_line_distance_m: number;
  pickup_window_start: string;
  pickup_window_end: string;
  freight_charge_assigned?: number;
  freight_charge_final?: number;
  freight_currency: string;
  requested_at: string;
  created_at: string;
}

export interface ListTransportResponse {
  transport_requests: TransportTripSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface TripEvent {
  id: string;
  event_type: string;
  status_before?: string;
  status_after?: string;
  actor_user_id?: string;
  notes?: string;
  occurred_at: string;
}

export interface TripInsurancePolicy {
  id: string;
  reference: string;
  coverage_amount: number;
  premium_amount: number;
  currency: string;
  status: string;
}

export interface TripDetail {
  transport_request: TransportRequest;
  insurance_policy?: TripInsurancePolicy;
  events: TripEvent[];
}

// ─── Notifications ──────────────────────────────────────────────────

export interface Notification {
  id: string;
  event_type: string;
  title: string;
  body: string;
  related_entity_type?: string;
  related_entity_id?: string;
  priority: "low" | "normal" | "high" | "urgent";
  read_at?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ListNotificationsResponse {
  notifications: Notification[];
  total: number;
  unread_count: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

// ─── Transport Summary ─────────────────────────────────────────────

export interface RecentEvent {
  trip_id: string;
  trip_reference: string;
  event_type: string;
  status_after?: string;
  occurred_at: string;
}

export interface TripSummaryResponse {
  active_count: number;
  delivered_this_month: number;
  total_spend_this_month: number;
  currency: string;
  recent_events: RecentEvent[];
}






































































// // Shared TypeScript types mirroring the backend auth response shapes.
// //
// // Hand-written to match the Go types. When the backend changes, these must
// // change with it. When we introduce codegen from OpenAPI in a later phase,
// // this file will be generated.

// export interface SessionResponse {
//   access_token: string;
//   refresh_token: string;
//   expires_at: string; // ISO 8601
//   user_id: string;
// }

// export interface RegisterRequest {
//   full_name: string;
//   phone_number: string;
//   email?: string;
//   channel: "sms" | "email";
// }

// export interface RegisterResponse {
//   user_id: string;
//   channel: "sms" | "email";
//   target: string;
//   message: string;
// }

// export interface VerifyRequest {
//   target: string;
//   channel: "sms" | "email";
//   code: string;
// }

// export interface SignInRequest {
//   identifier: string;
//   channel?: "sms" | "email";
// }

// export interface SignInResponse {
//   message: string;
// }

// export interface User {
//   id: string;
//   full_name: string;
//   phone_number: string;
//   email: string;
//   status: "active" | "suspended" | "pending_verification";
// }

// export interface MeResponse {
//   user: User;
// }

// export interface SessionSummary {
//   id: string;
//   user_agent?: string;
//   ip_address?: string;
//   created_at: string;
//   last_used_at?: string;
//   expires_at: string;
//   is_current: boolean;
// }

// export interface SessionsResponse {
//   sessions: SessionSummary[];
// }

// // The standard error envelope from the backend.
// export interface ApiError {
//   code: string;
//   message: string;
//   request_id?: string;
//   details?: Array<{ field?: string; code?: string; message: string }>;
// }




// // ─── Transport ──────────────────────────────────────────────────────

// export interface TransportRequest {
//   id: string;
//   reference: string;
//   status:
//     | "draft"
//     | "requested"
//     | "assignment_pending"
//     | "assigned"
//     | "shipper_confirmed"
//     | "vehicle_en_route"
//     | "at_pickup"
//     | "loaded"
//     | "in_transit"
//     | "at_destination"
//     | "delivered"
//     | "closed"
//     | "cancelled"
//     | "failed"
//     | "disputed";

//   requester_user_id: string;
//   requester_org_id: string;
//   external_reference?: string;

//   cargo_description: string;
//   cargo_declared_value: number;
//   cargo_currency: string;
//   cargo_weight_kg: number;
//   cargo_volume_m3?: number;

//   pickup_address: string;
//   pickup_latitude: number;
//   pickup_longitude: number;

//   destination_address: string;
//   destination_latitude: number;
//   destination_longitude: number;

//   straight_line_distance_m: number;

//   pickup_window_start: string;
//   pickup_window_end: string;

//   required_vehicle_type?: string;
//   required_min_capacity_kg?: number;

//   freight_currency: string;

//   requested_at: string;
//   created_at: string;
// }

// export interface TransportTripSummary {
//   id: string;
//   reference: string;
//   status: TransportRequest["status"];
//   cargo_description: string;
//   cargo_weight_kg: number;
//   pickup_address: string;
//   destination_address: string;
//   straight_line_distance_m: number;
//   pickup_window_start: string;
//   pickup_window_end: string;
//   freight_charge_assigned?: number;
//   freight_charge_final?: number;
//   freight_currency: string;
//   requested_at: string;
//   created_at: string;
// }

// export interface ListTransportResponse {
//   transport_requests: TransportTripSummary[];
//   total: number;
//   limit: number;
//   offset: number;
// }

// export interface TripEvent {
//   id: string;
//   event_type: string;
//   status_before?: string;
//   status_after?: string;
//   actor_user_id?: string;
//   notes?: string;
//   occurred_at: string;
// }

// export interface TripInsurancePolicy {
//   id: string;
//   reference: string;
//   coverage_amount: number;
//   premium_amount: number;
//   currency: string;
//   status: string;
// }

// export interface TripDetail {
//   transport_request: TransportRequest;
//   insurance_policy?: TripInsurancePolicy;
//   events: TripEvent[];
// }

// // ─── Notifications ──────────────────────────────────────────────────

// export interface Notification {
//   id: string;
//   event_type: string;
//   title: string;
//   body: string;
//   related_entity_type?: string;
//   related_entity_id?: string;
//   priority: "low" | "normal" | "high" | "urgent";
//   read_at?: string;
//   created_at: string;
//   metadata?: Record<string, unknown>;
// }

// export interface ListNotificationsResponse {
//   notifications: Notification[];
//   total: number;
//   unread_count: number;
// }

// export interface UnreadCountResponse {
//   unread_count: number;
// }


// export type OrganisationType =
//   | "farmer"
//   | "trader"
//   | "buyer"
//   | "transporter"
//   | "warehouse"
//   | "inspector"
//   | "fleet_owner";





// export interface Organisation {
//   id: string;
//   legal_name: string;
//   trading_name?: string;
//   organisation_type: OrganisationType;
//   primary_phone?: string;
//   primary_email?: string;
//   verification_status:
//     | "not_started"
//     | "draft"
//     | "submitted"
//     | "under_review"
//     | "additional_info_required"
//     | "verified"
//     | "rejected"
//     | "suspended";
//   status: "active" | "suspended" | "closed";
//   created_at: string;
//   updated_at: string;
//   role?: "owner" | "admin" | "manager" | "member" | "viewer";
// }