// apps/mobile/src/lib/api/client.ts
// The API client.
//
// One client. One place for all network calls. It:
//   - Injects the current access token on every request
//   - Intercepts 401 responses, transparently refreshes, retries the request
//   - Maps backend errors into typed exceptions
//   - Handles offline gracefully

import { storage } from "../auth/storage";
import type {
  ApiError,
  CreateOrganisationRequest,
  CreateOrganisationResponse,
  ListNotificationsResponse,
  ListOrganisationsResponse,
  ListTransportResponse,
  MeResponse,
  OrganisationTypesResponse,
  RegisterRequest,
  RegisterResponse,
  SessionResponse,
  SessionsResponse,
  SignInRequest,
  SignInResponse,
  TransportRequest,
  TripInsurancePolicy,
  TripDetail,
  UnreadCountResponse,
  VerifyRequest,
  TripSummaryResponse,
} from "./types";

import type { 
  RequestUploadRequest,
  RequestUploadResponse,
  SubmitVerificationRequest,
  SubmitVerificationResponse,
  TierListResponse,
  VerificationStatusResponse,
} from "./verification-types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

// Custom error so callers can branch on the backend code if needed.
export class HttpError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: ApiError["details"];

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "HttpError";
    this.code = error.code;
    this.status = status;
    this.requestId = error.request_id;
    this.details = error.details;
  }
}

// Only one refresh at a time. If multiple requests 401 simultaneously, one
// refresh happens; the others await its result.
let refreshingPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshingPromise) {
    return refreshingPromise;
  }

  refreshingPromise = (async () => {
    try {
      const refreshToken = await storage.getRefreshToken();
      if (!refreshToken) return false;

      const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        await storage.clearAll();
        return false;
      }

      const session: SessionResponse = await response.json();
      storage.setAccessToken(session.access_token);
      await storage.setRefreshToken(session.refresh_token);
      await storage.setUserId(session.user_id);
      return true;
    } catch {
      return false;
    } finally {
      refreshingPromise = null;
    }
  })();

  return refreshingPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const accessToken = storage.getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

    // Add X-Organisation-Id header when an active org is set. Transport
  // endpoints require it; other endpoints ignore it.
  const activeOrgId = storage.getActiveOrgId();
  if (activeOrgId) {
    headers["X-Organisation-Id"] = activeOrgId;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new HttpError(0, {
      code: "NETWORK_ERROR",
      message: "Unable to reach the server. Please check your connection.",
    });
  }

  // Silent refresh on 401.
  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request<T>(path, options, true);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const apiError = (body as ApiError | null) ?? {
      code: "UNKNOWN",
      message: `Request failed with status ${response.status}`,
    };
    throw new HttpError(response.status, apiError);
  }

  return body as T;
}

export const api = {
  async health(): Promise<{ status: string }> {
    return request("/healthz");
  },

  // ─── Auth ──────────────────────────────────────────────────────────
  async register(input: RegisterRequest): Promise<RegisterResponse> {
    return request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async verifyRegistration(input: VerifyRequest): Promise<SessionResponse> {
    return request("/api/v1/auth/register/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async signIn(input: SignInRequest): Promise<SignInResponse> {
    return request("/api/v1/auth/signin", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async verifySignIn(input: VerifyRequest): Promise<SessionResponse> {
    return request("/api/v1/auth/signin/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async refresh(refreshToken: string): Promise<SessionResponse> {
    return request("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  async signOut(): Promise<void> {
    return request("/api/v1/auth/signout", { method: "POST" });
  },

  // ─── User ──────────────────────────────────────────────────────────
  async me(): Promise<MeResponse> {
    return request("/api/v1/me");
  },

  // ─── Sessions ──────────────────────────────────────────────────────
  async listSessions(): Promise<SessionsResponse> {
    return request("/api/v1/auth/sessions");
  },

  async revokeSession(sessionId: string): Promise<void> {
    return request(`/api/v1/auth/sessions/${sessionId}`, { method: "DELETE" });
  },

  // ─── Organisations ─────────────────────────────────────────────────
  async listOrganisationTypes(): Promise<OrganisationTypesResponse> {
    return request("/api/v1/organisations/types");
  },

  async listMyOrganisations(): Promise<ListOrganisationsResponse> {
    return request("/api/v1/me/organisations");
  },

  async createOrganisation(
    input: CreateOrganisationRequest,
  ): Promise<CreateOrganisationResponse> {
    return request("/api/v1/organisations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getOrganisation(id: string): Promise<CreateOrganisationResponse> {
    return request(`/api/v1/organisations/${id}`);
  },

  // ─── Transport ─────────────────────────────────────────────────────
  async listTrips(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListTransportResponse> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/transport-requests${suffix}`);
  },

  async getTrip(id: string): Promise<TripDetail> {
    return request(`/api/v1/transport-requests/${id}`);
  },


  async getTripSummary(): Promise<TripSummaryResponse> {
    return request("/api/v1/transport-requests/summary");
  },






    async createTransportRequest(input: {
    cargo_description: string;
    cargo_declared_value: number;
    cargo_weight_kg: number;
    cargo_volume_m3?: number;
    pickup_address: string;
    pickup_latitude: number;
    pickup_longitude: number;
    destination_address: string;
    destination_latitude?: number;
    destination_longitude?: number;
    pickup_window_start: string;
    pickup_window_end: string;
    required_vehicle_type?: string;
    required_min_capacity_kg?: number;
    currency?: string;
    external_reference?: string;
  }): Promise<{ transport_request: TransportRequest; insurance_policy: TripInsurancePolicy }> {
    return request("/api/v1/transport-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },









  //   async createTransportRequest(input: {
  //   cargo_description: string;
  //   cargo_declared_value: number;
  //   cargo_weight_kg: number;
  //   cargo_volume_m3?: number;
  //   pickup_address: string;
  //   pickup_latitude: number;
  //   pickup_longitude: number;
  //   destination_address: string;
  //   destination_latitude: number;
  //   destination_longitude: number;
  //   pickup_window_start: string;
  //   pickup_window_end: string;
  //   required_vehicle_type?: string;
  //   required_min_capacity_kg?: number;
  //   currency?: string;
  //   external_reference?: string;
  // }): Promise<{ transport_request: TransportRequest; insurance_policy: TripInsurancePolicy }> {
  //   return request("/api/v1/transport-requests", {
  //     method: "POST",
  //     body: JSON.stringify(input),
  //   });
  // },

  // ─── Verification ──────────────────────────────────────────────────
  async listVerificationTiers(): Promise<TierListResponse> {
    return request("/api/v1/verification/tiers");
  },

  async getVerificationStatus(
    orgId: string,
  ): Promise<VerificationStatusResponse> {
    return request(`/api/v1/organisations/${orgId}/verification`);
  },

  async requestDocumentUpload(
    input: RequestUploadRequest,
  ): Promise<RequestUploadResponse> {
    return request("/api/v1/documents/upload-url", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async confirmDocumentUpload(documentId: string): Promise<void> {
    return request(`/api/v1/documents/${documentId}/confirm`, {
      method: "POST",
    });
  },

  async getDocumentDownloadUrl(
    documentId: string,
  ): Promise<{ url: string }> {
    return request(`/api/v1/documents/${documentId}/url`);
  },

  async submitVerification(
    orgId: string,
    input: SubmitVerificationRequest,
  ): Promise<SubmitVerificationResponse> {
    return request(`/api/v1/organisations/${orgId}/verification`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },



  // ─── Notifications ─────────────────────────────────────────────────
  async listNotifications(): Promise<ListNotificationsResponse> {
    return request("/api/v1/notifications");
  },

  async unreadNotificationCount(): Promise<UnreadCountResponse> {
    return request("/api/v1/notifications/unread-count");
  },

  async markNotificationRead(id: string): Promise<void> {
    return request(`/api/v1/notifications/${id}/read`, { method: "POST" });
  },
};

export { refreshTokens };







































































// // The API client.
// //
// // One client. One place for all network calls. It:
// //   - Injects the current access token on every request
// //   - Intercepts 401 responses, transparently refreshes, retries the request
// //   - Maps backend errors into typed exceptions
// //   - Handles offline gracefully

// import { storage } from "../auth/storage";
// import type {
//   ApiError,
//   CreateOrganisationRequest,
//   CreateOrganisationResponse,
//   ListNotificationsResponse,
//   ListOrganisationsResponse,
//   ListTransportResponse,
//   MeResponse,
//   Notification,
//   OrganisationTypesResponse,
//   RegisterRequest,
//   RegisterResponse,
//   SessionResponse,
//   SessionsResponse,
//   SignInRequest,
//   SignInResponse,
//   TripDetail,
//   UnreadCountResponse,
//   VerifyRequest,
// } from "./types";

// const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

// // Custom error so callers can branch on the backend code if needed.
// export class HttpError extends Error {
//   code: string;
//   status: number;
//   requestId?: string;
//   details?: ApiError["details"];

//   constructor(status: number, error: ApiError) {
//     super(error.message);
//     this.name = "HttpError";
//     this.code = error.code;
//     this.status = status;
//     this.requestId = error.request_id;
//     this.details = error.details;
//   }
// }

// // Only one refresh at a time. If multiple requests 401 simultaneously, one
// // refresh happens; the others await its result.
// let refreshingPromise: Promise<boolean> | null = null;

// async function refreshTokens(): Promise<boolean> {
//   if (refreshingPromise) {
//     return refreshingPromise;
//   }

//   refreshingPromise = (async () => {
//     try {
//       const refreshToken = await storage.getRefreshToken();
//       if (!refreshToken) return false;

//       const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ refresh_token: refreshToken }),
//       });

//       if (!response.ok) {
//         await storage.clearAll();
//         return false;
//       }

//       const session: SessionResponse = await response.json();
//       storage.setAccessToken(session.access_token);
//       await storage.setRefreshToken(session.refresh_token);
//       await storage.setUserId(session.user_id);
//       return true;
//     } catch {
//       return false;
//     } finally {
//       refreshingPromise = null;
//     }
//   })();

//   return refreshingPromise;
// }

// async function request<T>(
//   path: string,
//   options: RequestInit = {},
//   isRetry = false,
// ): Promise<T> {
//   const accessToken = storage.getAccessToken();

//   const headers: Record<string, string> = {
//     "Content-Type": "application/json",
//     ...(options.headers as Record<string, string> | undefined),
//   };

//   if (accessToken) {
//     headers["Authorization"] = `Bearer ${accessToken}`;
//   }

//   let response: Response;
//   try {
//     response = await fetch(`${API_URL}${path}`, { ...options, headers });
//   } catch {
//     throw new HttpError(0, {
//       code: "NETWORK_ERROR",
//       message: "Unable to reach the server. Please check your connection.",
//     });
//   }

//   // Silent refresh on 401.
//   if (response.status === 401 && !isRetry) {
//     const refreshed = await refreshTokens();
//     if (refreshed) {
//       return request<T>(path, options, true);
//     }
//   }

//   if (response.status === 204) {
//     return undefined as T;
//   }

//   let body: unknown;
//   try {
//     body = await response.json();
//   } catch {
//     body = null;
//   }

//   if (!response.ok) {
//     const apiError = (body as ApiError | null) ?? {
//       code: "UNKNOWN",
//       message: `Request failed with status ${response.status}`,
//     };
//     throw new HttpError(response.status, apiError);
//   }

//   return body as T;
// }

// export const api = {
//   async health(): Promise<{ status: string }> {
//     return request("/healthz");
//   },

//   // Auth
//   async register(input: RegisterRequest): Promise<RegisterResponse> {
//     return request("/api/v1/auth/register", {
//       method: "POST",
//       body: JSON.stringify(input),
//     });
//   },

//   async verifyRegistration(input: VerifyRequest): Promise<SessionResponse> {
//     return request("/api/v1/auth/register/verify", {
//       method: "POST",
//       body: JSON.stringify(input),
//     });
//   },

//   async signIn(input: SignInRequest): Promise<SignInResponse> {
//     return request("/api/v1/auth/signin", {
//       method: "POST",
//       body: JSON.stringify(input),
//     });
//   },

//   async verifySignIn(input: VerifyRequest): Promise<SessionResponse> {
//     return request("/api/v1/auth/signin/verify", {
//       method: "POST",
//       body: JSON.stringify(input),
//     });
//   },

//   async refresh(refreshToken: string): Promise<SessionResponse> {
//     return request("/api/v1/auth/refresh", {
//       method: "POST",
//       body: JSON.stringify({ refresh_token: refreshToken }),
//     });
//   },

//   async signOut(): Promise<void> {
//     return request("/api/v1/auth/signout", { method: "POST" });
//   },

//   // User
//   async me(): Promise<MeResponse> {
//     return request("/api/v1/me");
//   },

//   // Sessions
//   async listSessions(): Promise<SessionsResponse> {
//     return request("/api/v1/auth/sessions");
//   },

//   async revokeSession(sessionId: string): Promise<void> {
//     return request(`/api/v1/auth/sessions/${sessionId}`, { method: "DELETE" });
//   },

  
//   // Transport
//   async listTrips(params?: {
//     status?: string;
//     limit?: number;
//     offset?: number;
//   }): Promise<ListTransportResponse> {
//     const q = new URLSearchParams();
//     if (params?.status) q.set("status", params.status);
//     if (params?.limit) q.set("limit", String(params.limit));
//     if (params?.offset) q.set("offset", String(params.offset));
//     const suffix = q.toString() ? `?${q.toString()}` : "";
//     return request(`/api/v1/transport-requests${suffix}`);
//   },

//   async getTrip(id: string): Promise<TripDetail> {
//     return request(`/api/v1/transport-requests/${id}`);
//   },

//   // Notifications
//   async listNotifications(): Promise<ListNotificationsResponse> {
//     return request("/api/v1/notifications");
//   },

//   async unreadNotificationCount(): Promise<UnreadCountResponse> {
//     return request("/api/v1/notifications/unread-count");
//   },

//   async markNotificationRead(id: string): Promise<void> {
//     return request(`/api/v1/notifications/${id}/read`, { method: "POST" });
//   },


// };




  
// export { refreshTokens };