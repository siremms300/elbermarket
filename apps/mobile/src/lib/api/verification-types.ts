// Verification types — matching backend responses.

export type VerificationTier = "unverified" | "basic" | "business" | "fleet_owner";
export type VerificationStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "under_review"
  | "additional_info_required"
  | "verified"
  | "rejected"
  | "suspended";

export type DocumentType =
  | "national_id"
  | "selfie"
  // | "phone_reference"
  | "cac_certificate"
  | "proof_of_address"
  | "vehicle_registration"
  | "vehicle_insurance"
  | "driver_license";

export interface TierInfo {
  key: "basic" | "business" | "fleet_owner";
  label: string;
  description: string;
  requires: DocumentType[];
  unlocks: string[];
}

export interface TierListResponse {
  tiers: TierInfo[];
}

export interface VerificationCaseInfo {
  case_id: string;
  case_reference: string;
  status: VerificationStatus;
  requested_tier: "basic" | "business" | "fleet_owner";
  approved_tier?: string;
  decision?: "approved" | "rejected" | "more_info";
  decision_reason?: string;
  submitted_at?: string;
  decided_at?: string;
}

export interface VerificationStatusResponse {
  verification_status: VerificationStatus;
  verification_tier: VerificationTier;
  current_case?: VerificationCaseInfo;
}

export interface RequestUploadRequest {
  owner_type: "organisation";
  owner_id: string;
  document_type: DocumentType;
  content_type: string;
  file_size_bytes: number;
  filename?: string;
}

export interface RequestUploadResponse {
  document_id: string;
  storage_key: string;
  upload: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
}

export interface SubmitVerificationRequest {
  requested_tier: "basic" | "business" | "fleet_owner";
  document_ids: string[];
}

export interface SubmitVerificationResponse {
  case_id: string;
  case_reference: string;
  status: VerificationStatus;
  requested_tier: string;
  submitted_at: string;
}

// Human-readable labels for document types.
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  national_id: "Government ID",
  selfie: "Selfie with ID",
  // phone_reference: "Phone reference",
  cac_certificate: "CAC certificate",
  proof_of_address: "Proof of address",
  vehicle_registration: "Vehicle registration",
  vehicle_insurance: "Vehicle insurance",
  driver_license: "Driver license",
};

export const DOCUMENT_TYPE_HINTS: Partial<Record<DocumentType, string>> = {
  national_id: "Your NIN card, voter ID, driver license, or passport",
  selfie: "A clear photo of your face holding your ID",
  // phone_reference: "Contact number of a reference we can call to confirm you",
  cac_certificate: "Your business registration certificate from CAC",
  proof_of_address: "Utility bill or bank statement less than 3 months old",
  vehicle_registration: "Registration document for each vehicle",
  vehicle_insurance: "Valid insurance certificate for each vehicle",
  driver_license: "Valid driver's license for each driver",
};