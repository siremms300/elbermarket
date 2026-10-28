// The auth context.
//
// Holds the current user, their organisations, the active organisation,
// and the loading state. Also exposes sign-in, sign-out, org refresh,
// and org switching.
//
// Every request made with this session includes the active organisation
// ID as the X-Organisation-Id header. If no active org is set, transport
// requests fail with "header required."

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, refreshTokens } from "../api/client";
import { storage } from "./storage";
import type { Organisation, User } from "../api/types";

interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: User | null;
  organisations: Organisation[];
}

interface AuthContextValue extends AuthState {
  signInWithSession: (session: {
    access_token: string;
    refresh_token: string;
    user_id: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshOrganisations: () => Promise<void>;
  setActiveOrganisation: (orgId: string) => Promise<void>;
  getActiveOrganisation: () => Organisation | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    organisations: [],
  });

  // ─── Bootstrap on mount ────────────────────────────────────────────
  // If a valid refresh token exists, restore the session: refresh tokens,
  // load user, load organisations, set active org.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Load active org from storage first — it may persist across
        // app restarts and should be available before any API call.
        await storage.loadActiveOrgId();

        const refreshToken = await storage.getRefreshToken();
        if (!refreshToken) {
          if (!cancelled) {
            setState({
              status: "unauthenticated",
              user: null,
              organisations: [],
            });
          }
          return;
        }

        const refreshed = await refreshTokens();
        if (!refreshed) {
          if (!cancelled) {
            setState({
              status: "unauthenticated",
              user: null,
              organisations: [],
            });
          }
          return;
        }

        const [me, orgs] = await Promise.all([
          api.me(),
          api.listMyOrganisations(),
        ]);
        const orgList = orgs.organisations ?? [];

        // If no active org is set yet and the user has at least one, use
        // the first. This ensures the header is always available for
        // subsequent requests.
        if (!storage.getActiveOrgId() && orgList.length > 0) {
          await storage.setActiveOrgIdPersistent(orgList[0].id);
        }

        if (!cancelled) {
          setState({
            status: "authenticated",
            user: me.user,
            organisations: orgList,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "unauthenticated",
            user: null,
            organisations: [],
          });
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Sign in with a fresh session ──────────────────────────────────
  // Called after OTP verification succeeds. Stores tokens, loads user
  // and orgs, and sets the active org.
  const signInWithSession = useCallback(
    async (session: {
      access_token: string;
      refresh_token: string;
      user_id: string;
    }) => {
      storage.setAccessToken(session.access_token);
      await storage.setRefreshToken(session.refresh_token);
      await storage.setUserId(session.user_id);

      try {
        const [me, orgs] = await Promise.all([
          api.me(),
          api.listMyOrganisations(),
        ]);
        const orgList = orgs.organisations ?? [];

        // Set active org if the user has at least one. If they have
        // none, the app should redirect them to org creation.
        if (orgList.length > 0) {
          await storage.setActiveOrgIdPersistent(orgList[0].id);
        }

        setState({
          status: "authenticated",
          user: me.user,
          organisations: orgList,
        });
      } catch {
        setState({
          status: "authenticated",
          user: null,
          organisations: [],
        });
      }
    },
    [],
  );

  // ─── Sign out ──────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } catch {
      // Best effort — if network is down, still clear locally.
    }
    await storage.clearAll();
    setState({
      status: "unauthenticated",
      user: null,
      organisations: [],
    });
  }, []);

  // ─── Refresh user ──────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const me = await api.me();
      setState((prev) => ({ ...prev, user: me.user }));
    } catch {
      // The next API call will handle 401s.
    }
  }, []);

  // ─── Refresh organisations ─────────────────────────────────────────
  const refreshOrganisations = useCallback(async () => {
    try {
      const orgs = await api.listMyOrganisations();
      const orgList = orgs.organisations ?? [];

      // If active org is no longer in the list, reset to first or null.
      const currentActive = storage.getActiveOrgId();
      const stillValid = currentActive
        ? orgList.some((o) => o.id === currentActive)
        : false;

      if (!stillValid) {
        const newActive = orgList.length > 0 ? orgList[0].id : null;
        await storage.setActiveOrgIdPersistent(newActive);
      }

      setState((prev) => ({
        ...prev,
        organisations: orgList,
      }));
    } catch {
      // Ignore — stale data stays until next successful fetch.
    }
  }, []);

  // ─── Set active organisation ───────────────────────────────────────
  // Called when the user switches which business they're acting on
  // behalf of. Updates storage so the header is used on next request.
  const setActiveOrganisation = useCallback(
    async (orgId: string) => {
      const exists = state.organisations.some((o) => o.id === orgId);
      if (!exists) {
        throw new Error("Organisation not found in your account");
      }
      await storage.setActiveOrgIdPersistent(orgId);
      // Force re-render so consumers that read the active org re-fetch.
      setState((prev) => ({ ...prev }));
    },
    [state.organisations],
  );

  // ─── Get active organisation ───────────────────────────────────────
  const getActiveOrganisation = useCallback((): Organisation | null => {
    const id = storage.getActiveOrgId();
    if (!id) return null;
    return state.organisations.find((o) => o.id === id) ?? null;
  }, [state.organisations]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signInWithSession,
        signOut,
        refreshUser,
        refreshOrganisations,
        setActiveOrganisation,
        getActiveOrganisation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}























































// // The auth context.
// //
// // Holds the current user, their organisations, and the loading state.
// // Also exposes sign-in, sign-out, and organisation refresh actions.

// import React, {
//   createContext,
//   useCallback,
//   useContext,
//   useEffect,
//   useState,
// } from "react";
// import { api, refreshTokens } from "../api/client";
// import { storage } from "./storage";
// import type { Organisation, User } from "../api/types";

// interface AuthState {
//   status: "loading" | "authenticated" | "unauthenticated";
//   user: User | null;
//   organisations: Organisation[];
// }

// interface AuthContextValue extends AuthState {
//   signInWithSession: (session: {
//     access_token: string;
//     refresh_token: string;
//     user_id: string;
//   }) => Promise<void>;
//   signOut: () => Promise<void>;
//   refreshUser: () => Promise<void>;
//   refreshOrganisations: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextValue | null>(null);

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [state, setState] = useState<AuthState>({
//     status: "loading",
//     user: null,
//     organisations: [],
//   });

//   useEffect(() => {
//     let cancelled = false;

//     async function bootstrap() {
//       try {
//         const refreshToken = await storage.getRefreshToken();
//         if (!refreshToken) {
//           if (!cancelled) {
//             setState({
//               status: "unauthenticated",
//               user: null,
//               organisations: [],
//             });
//           }
//           return;
//         }

//         const refreshed = await refreshTokens();
//         if (!refreshed) {
//           if (!cancelled) {
//             setState({
//               status: "unauthenticated",
//               user: null,
//               organisations: [],
//             });
//           }
//           return;
//         }

//         const [me, orgs] = await Promise.all([
//           api.me(),
//           api.listMyOrganisations(),
//         ]);
//         if (!cancelled) {
//           setState({
//             status: "authenticated",
//             user: me.user,
//             organisations: orgs.organisations ?? [],
//           });
//         }
//       } catch {
//         if (!cancelled) {
//           setState({
//             status: "unauthenticated",
//             user: null,
//             organisations: [],
//           });
//         }
//       }
//     }

//     bootstrap();
//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   const signInWithSession = useCallback(
//     async (session: {
//       access_token: string;
//       refresh_token: string;
//       user_id: string;
//     }) => {
//       storage.setAccessToken(session.access_token);
//       await storage.setRefreshToken(session.refresh_token);
//       await storage.setUserId(session.user_id);

//       try {
//         const [me, orgs] = await Promise.all([
//           api.me(),
//           api.listMyOrganisations(),
//         ]);
//         setState({
//           status: "authenticated",
//           user: me.user,
//           organisations: orgs.organisations ?? [],
//         });
//       } catch {
//         setState({
//           status: "authenticated",
//           user: null,
//           organisations: [],
//         });
//       }
//     },
//     [],
//   );

//   const signOut = useCallback(async () => {
//     try {
//       await api.signOut();
//     } catch {
//       // Best effort.
//     }
//     await storage.clearAll();
//     setState({
//       status: "unauthenticated",
//       user: null,
//       organisations: [],
//     });
//   }, []);

//   const refreshUser = useCallback(async () => {
//     try {
//       const me = await api.me();
//       setState((prev) => ({ ...prev, user: me.user }));
//     } catch {
//       // The next API call will handle 401s.
//     }
//   }, []);

//   const refreshOrganisations = useCallback(async () => {
//     try {
//       const orgs = await api.listMyOrganisations();
//       setState((prev) => ({
//         ...prev,
//         organisations: orgs.organisations ?? [],
//       }));
//     } catch {
//       // Ignore.
//     }
//   }, []);

//   return (
//     <AuthContext.Provider
//       value={{
//         ...state,
//         signInWithSession,
//         signOut,
//         refreshUser,
//         refreshOrganisations,
//       }}
//     >
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth(): AuthContextValue {
//   const ctx = useContext(AuthContext);
//   if (!ctx) {
//     throw new Error("useAuth must be used within an AuthProvider");
//   }
//   return ctx;
// }













































// // The auth context.
// //
// // Holds the current user, their organisations, and the loading state.
// // Also exposes sign-in, sign-out, and organisation refresh actions.

// import React, {
//   createContext,
//   useCallback,
//   useContext,
//   useEffect,
//   useState,
// } from "react";
// import { api, refreshTokens } from "../api/client";
// import { storage } from "./storage";
// import type { Organisation, User } from "../api/types";

// interface AuthState {
//   status: "loading" | "authenticated" | "unauthenticated";
//   user: User | null;
//   organisations: Organisation[];
// }

// interface AuthContextValue extends AuthState {
//   signInWithSession: (session: {
//     access_token: string;
//     refresh_token: string;
//     user_id: string;
//   }) => Promise<void>;
//   signOut: () => Promise<void>;
//   refreshUser: () => Promise<void>;
//   refreshOrganisations: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextValue | null>(null);

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [state, setState] = useState<AuthState>({
//     status: "loading",
//     user: null,
//     organisations: [],
//   });

//   useEffect(() => {
//     let cancelled = false;

//     async function bootstrap() {
//       try {
//         const refreshToken = await storage.getRefreshToken();
//         if (!refreshToken) {
//           if (!cancelled) {
//             setState({
//               status: "unauthenticated",
//               user: null,
//               organisations: [],
//             });
//           }
//           return;
//         }

//         const refreshed = await refreshTokens();
//         if (!refreshed) {
//           if (!cancelled) {
//             setState({
//               status: "unauthenticated",
//               user: null,
//               organisations: [],
//             });
//           }
//           return;
//         }

//         const [me, orgs] = await Promise.all([
//           api.me(),
//           api.listMyOrganisations(),
//         ]);
//         if (!cancelled) {
//           setState({
//             status: "authenticated",
//             user: me.user,
//             organisations: orgs.organisations ?? [],
//           });
//         }
//       } catch {
//         if (!cancelled) {
//           setState({
//             status: "unauthenticated",
//             user: null,
//             organisations: [],
//           });
//         }
//       }
//     }

//     bootstrap();
//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   const signInWithSession = useCallback(
//     async (session: {
//       access_token: string;
//       refresh_token: string;
//       user_id: string;
//     }) => {
//       storage.setAccessToken(session.access_token);
//       await storage.setRefreshToken(session.refresh_token);
//       await storage.setUserId(session.user_id);

//       try {
//         const [me, orgs] = await Promise.all([
//           api.me(),
//           api.listMyOrganisations(),
//         ]);
//         setState({
//           status: "authenticated",
//           user: me.user,
//           organisations: orgs.organisations ?? [],
//         });
//       } catch {
//         setState({
//           status: "authenticated",
//           user: null,
//           organisations: [],
//         });
//       }
//     },
//     [],
//   );

//   const signOut = useCallback(async () => {
//     try {
//       await api.signOut();
//     } catch {
//       // Best effort.
//     }
//     await storage.clearAll();
//     setState({
//       status: "unauthenticated",
//       user: null,
//       organisations: [],
//     });
//   }, []);

//   const refreshUser = useCallback(async () => {
//     try {
//       const me = await api.me();
//       setState((prev) => ({ ...prev, user: me.user }));
//     } catch {
//       // The next API call will handle 401s.
//     }
//   }, []);

//   const refreshOrganisations = useCallback(async () => {
//     try {
//       const orgs = await api.listMyOrganisations();
//       setState((prev) => ({
//         ...prev,
//         organisations: orgs.organisations ?? [],
//       }));
//     } catch {
//       // Ignore.
//     }
//   }, []);

//   return (
//     <AuthContext.Provider
//       value={{
//         ...state,
//         signInWithSession,
//         signOut,
//         refreshUser,
//         refreshOrganisations,
//       }}
//     >
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth(): AuthContextValue {
//   const ctx = useContext(AuthContext);
//   if (!ctx) {
//     throw new Error("useAuth must be used within an AuthProvider");
//   }
//   return ctx;
// }






























// // The auth context.
// //
// // Exposes:
// //   - The current user (or null if signed out)
// //   - Loading state during bootstrap (checking secure storage)
// //   - signInWithSession / signOut / refreshUser actions
// //
// // This is the single source of truth for "am I signed in?" in the app.
// // Screens never read tokens directly — they ask this context.

// import React, {
//   createContext,
//   useCallback,
//   useContext,
//   useEffect,
//   useState,
// } from "react";
// import { api, refreshTokens } from "../api/client";
// import { storage } from "./storage";
// import type { User } from "../api/types";

// interface AuthState {
//   status: "loading" | "authenticated" | "unauthenticated";
//   user: User | null;
// }

// interface AuthContextValue extends AuthState {
//   signInWithSession: (session: {
//     access_token: string;
//     refresh_token: string;
//     user_id: string;
//   }) => Promise<void>;
//   signOut: () => Promise<void>;
//   refreshUser: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextValue | null>(null);

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [state, setState] = useState<AuthState>({
//     status: "loading",
//     user: null,
//   });

//   // Bootstrap: on mount, restore the session from secure storage if
//   // possible. This is what makes "open app → still signed in" work.
//   useEffect(() => {
//     let cancelled = false;

//     async function bootstrap() {
//       try {
//         const refreshToken = await storage.getRefreshToken();
//         if (!refreshToken) {
//           if (!cancelled) {
//             setState({ status: "unauthenticated", user: null });
//           }
//           return;
//         }

//         const refreshed = await refreshTokens();
//         if (!refreshed) {
//           if (!cancelled) {
//             setState({ status: "unauthenticated", user: null });
//           }
//           return;
//         }

//         const me = await api.me();
//         if (!cancelled) {
//           setState({ status: "authenticated", user: me.user });
//         }
//       } catch {
//         if (!cancelled) {
//           setState({ status: "unauthenticated", user: null });
//         }
//       }
//     }

//     bootstrap();
//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   const signInWithSession = useCallback(
//     async (session: {
//       access_token: string;
//       refresh_token: string;
//       user_id: string;
//     }) => {
//       storage.setAccessToken(session.access_token);
//       await storage.setRefreshToken(session.refresh_token);
//       await storage.setUserId(session.user_id);

//       try {
//         const me = await api.me();
//         setState({ status: "authenticated", user: me.user });
//       } catch {
//         setState({ status: "authenticated", user: null });
//       }
//     },
//     [],
//   );

//   const signOut = useCallback(async () => {
//     try {
//       await api.signOut();
//     } catch {
//       // Best effort — if the network is down, sign out locally anyway.
//     }
//     await storage.clearAll();
//     setState({ status: "unauthenticated", user: null });
//   }, []);

//   const refreshUser = useCallback(async () => {
//     try {
//       const me = await api.me();
//       setState((prev) => ({ ...prev, user: me.user }));
//     } catch {
//       // The next API call will handle 401s.
//     }
//   }, []);

//   return (
//     <AuthContext.Provider
//       value={{ ...state, signInWithSession, signOut, refreshUser }}
//     >
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth(): AuthContextValue {
//   const ctx = useContext(AuthContext);
//   if (!ctx) {
//     throw new Error("useAuth must be used within an AuthProvider");
//   }
//   return ctx;
// }