// Secure token storage.
//
// Access token is kept in memory. Refresh token, user ID, and active
// organisation are stored in secure storage (Keychain on iOS, Keystore
// on Android). On web, falls back to localStorage.
//
// The active organisation is stored separately because it's the context
// in which every request is made — the "current business" the user is
// acting on behalf of.

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "elber.refresh_token";
const USER_ID_KEY = "elber.user_id";
const ACTIVE_ORG_KEY = "elber.active_org_id";

let cachedAccessToken: string | null = null;
let cachedActiveOrgId: string | null = null;

const isWeb = Platform.OS === "web";

async function storeGet(key: string): Promise<string | null> {
  try {
    if (isWeb) return localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string): Promise<void> {
  try {
    if (isWeb) {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`Failed to persist ${key}`, error);
  }
}

async function storeDelete(key: string): Promise<void> {
  try {
    if (isWeb) {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error(`Failed to clear ${key}`, error);
  }
}

export const storage = {
  // ─── Access token (memory only) ─────────────────────────────────
  getAccessToken(): string | null {
    return cachedAccessToken;
  },
  setAccessToken(token: string | null): void {
    cachedAccessToken = token;
  },

  // ─── Refresh token ──────────────────────────────────────────────
  async getRefreshToken(): Promise<string | null> {
    return storeGet(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string | null): Promise<void> {
    if (token === null) await storeDelete(REFRESH_TOKEN_KEY);
    else await storeSet(REFRESH_TOKEN_KEY, token);
  },

  // ─── User ID ────────────────────────────────────────────────────
  async getUserId(): Promise<string | null> {
    return storeGet(USER_ID_KEY);
  },
  async setUserId(id: string | null): Promise<void> {
    if (id === null) await storeDelete(USER_ID_KEY);
    else await storeSet(USER_ID_KEY, id);
  },

  // ─── Active organisation ────────────────────────────────────────
  // The organisation the user is currently acting on behalf of. Sent
  // on every request as the X-Organisation-Id header. Cached in memory
  // for fast reads; persisted to secure storage for session continuity.
  getActiveOrgId(): string | null {
    return cachedActiveOrgId;
  },
  async setActiveOrgIdPersistent(id: string | null): Promise<void> {
    cachedActiveOrgId = id;
    if (id === null) await storeDelete(ACTIVE_ORG_KEY);
    else await storeSet(ACTIVE_ORG_KEY, id);
  },
  async loadActiveOrgId(): Promise<string | null> {
    const id = await storeGet(ACTIVE_ORG_KEY);
    cachedActiveOrgId = id;
    return id;
  },

  // ─── Clear everything (sign out) ────────────────────────────────
  async clearAll(): Promise<void> {
    cachedAccessToken = null;
    cachedActiveOrgId = null;
    await storeDelete(REFRESH_TOKEN_KEY);
    await storeDelete(USER_ID_KEY);
    await storeDelete(ACTIVE_ORG_KEY);
  },
};













































// // Secure token storage.
// //
// // The access token is short-lived (1 hour) and kept in memory only.
// // The refresh token is long-lived (30 days) and stored via the platform's
// // secure storage — Keychain on iOS, Keystore on Android.
// //
// // Web has no secure enclave. For web testing, we fall back to localStorage.
// // That is NOT secure enough for production web use, and when we build the
// // real web app we will use httpOnly cookies issued by the backend instead.
// // For now, localStorage on web keeps the dev experience smooth.

// import * as SecureStore from "expo-secure-store";
// import { Platform } from "react-native";

// const REFRESH_TOKEN_KEY = "elber.refresh_token";
// const USER_ID_KEY = "elber.user_id";

// // In-memory cache of the current access token.
// let cachedAccessToken: string | null = null;

// // ─── Platform-aware storage primitives ─────────────────────────────────
// //
// // These three functions hide the difference between web (localStorage)
// // and native (SecureStore). Every other function in this file goes
// // through these, so the rest of the app doesn't know which platform
// // it's running on.

// const isWeb = Platform.OS === "web";

// async function storeGet(key: string): Promise<string | null> {
//   try {
//     if (isWeb) {
//       return localStorage.getItem(key);
//     }
//     return await SecureStore.getItemAsync(key);
//   } catch {
//     return null;
//   }
// }

// async function storeSet(key: string, value: string): Promise<void> {
//   try {
//     if (isWeb) {
//       localStorage.setItem(key, value);
//       return;
//     }
//     await SecureStore.setItemAsync(key, value);
//   } catch (error) {
//     console.error(`Failed to persist ${key}`, error);
//   }
// }

// async function storeDelete(key: string): Promise<void> {
//   try {
//     if (isWeb) {
//       localStorage.removeItem(key);
//       return;
//     }
//     await SecureStore.deleteItemAsync(key);
//   } catch (error) {
//     console.error(`Failed to clear ${key}`, error);
//   }
// }

// // ─── Public storage interface ──────────────────────────────────────────

// export const storage = {
//   // Access token — memory only.
//   getAccessToken(): string | null {
//     return cachedAccessToken;
//   },
//   setAccessToken(token: string | null): void {
//     cachedAccessToken = token;
//   },

//   // Refresh token.
//   async getRefreshToken(): Promise<string | null> {
//     return storeGet(REFRESH_TOKEN_KEY);
//   },
//   async setRefreshToken(token: string | null): Promise<void> {
//     if (token === null) {
//       await storeDelete(REFRESH_TOKEN_KEY);
//     } else {
//       await storeSet(REFRESH_TOKEN_KEY, token);
//     }
//   },

//   // User ID.
//   async getUserId(): Promise<string | null> {
//     return storeGet(USER_ID_KEY);
//   },
//   async setUserId(id: string | null): Promise<void> {
//     if (id === null) {
//       await storeDelete(USER_ID_KEY);
//     } else {
//       await storeSet(USER_ID_KEY, id);
//     }
//   },

//   // Clear everything — sign out.
//   async clearAll(): Promise<void> {
//     cachedAccessToken = null;
//     await storeDelete(REFRESH_TOKEN_KEY);
//     await storeDelete(USER_ID_KEY);
//   },
// };











// @@@@@@@@@@@@@@@@@@@@@2 THE CODE BELOW IS FOR PRODUCTION @@@@@@@@@@@@@@@@@@@@@@@@@@






























































// // Secure token storage.
// //
// // The access token is short-lived (1 hour) and kept in memory only —
// // it never touches disk. An attacker with disk access gains nothing.
// //
// // The refresh token is long-lived (30 days) and stored in the platform's
// // secure storage — Keychain on iOS, Keystore on Android. The OS encrypts
// // it at rest.
// //
// // The rest of the app never calls expo-secure-store directly — always
// // through this module.

// import * as SecureStore from "expo-secure-store";

// const REFRESH_TOKEN_KEY = "elber.refresh_token";
// const USER_ID_KEY = "elber.user_id";

// // In-memory cache of the current access token.
// let cachedAccessToken: string | null = null;

// export const storage = {
//   // Access token — memory only.
//   getAccessToken(): string | null {
//     return cachedAccessToken;
//   },
//   setAccessToken(token: string | null): void {
//     cachedAccessToken = token;
//   },

//   // Refresh token — secure storage.
//   async getRefreshToken(): Promise<string | null> {
//     try {
//       return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
//     } catch {
//       return null;
//     }
//   },
//   async setRefreshToken(token: string | null): Promise<void> {
//     try {
//       if (token === null) {
//         await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
//       } else {
//         await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
//       }
//     } catch (error) {
//       console.error("Failed to persist refresh token", error);
//     }
//   },

//   // User ID — stored for quick access; not sensitive.
//   async getUserId(): Promise<string | null> {
//     try {
//       return await SecureStore.getItemAsync(USER_ID_KEY);
//     } catch {
//       return null;
//     }
//   },
//   async setUserId(id: string | null): Promise<void> {
//     try {
//       if (id === null) {
//         await SecureStore.deleteItemAsync(USER_ID_KEY);
//       } else {
//         await SecureStore.setItemAsync(USER_ID_KEY, id);
//       }
//     } catch (error) {
//       console.error("Failed to persist user id", error);
//     }
//   },

//   // Clear everything — sign out.
//   async clearAll(): Promise<void> {
//     cachedAccessToken = null;
//     try {
//       await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
//       await SecureStore.deleteItemAsync(USER_ID_KEY);
//     } catch (error) {
//       console.error("Failed to clear secure storage", error);
//     }
//   },
// };