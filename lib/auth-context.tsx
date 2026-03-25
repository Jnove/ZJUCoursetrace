/**
 * lib/auth-context.tsx
 *
 * Uses zju-client directly — no backend server needed.
 * Authentication state is stored in native cookie jar (by zju-client)
 * and the username in AsyncStorage. userToken = username (non-null = logged in).
 */
import React, { createContext, useReducer, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login as zjuLogin, loadSession, clearSession } from "@/lib/zju-client";

export type AuthState = {
  isLoading: boolean;
  isSignout: boolean;
  userToken: string | null;
  username: string | null;
  error: string | null;
};

export type AuthContextType = {
  state: AuthState;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: "RESTORE_TOKEN"; payload: { token: string | null; username: string | null } }
  | { type: "SIGN_IN_START" }
  | { type: "SIGN_IN_SUCCESS"; payload: { token: string; username: string } }
  | { type: "SIGN_IN_FAILURE"; payload: { error: string } }
  | { type: "SIGN_OUT" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "RESTORE_TOKEN":
      return { ...state, userToken: action.payload.token, username: action.payload.username, isLoading: false };
    case "SIGN_IN_START":
      return { ...state, isLoading: true, error: null };
    case "SIGN_IN_SUCCESS":
      return { ...state, isSignout: false, userToken: action.payload.token, username: action.payload.username, isLoading: false, error: null };
    case "SIGN_IN_FAILURE":
      return { ...state, isLoading: false, error: action.payload.error };
    case "SIGN_OUT":
      return { ...state, isSignout: true, userToken: null, username: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    isLoading: true,
    isSignout: false,
    userToken: null,
    username: null,
    error: null,
  });

  // On cold start: check if username is stored (fast, no network).
  // Actual session validity is checked lazily when data is fetched;
  // withRelogin in zju-client handles expired sessions transparently.
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const username = await AsyncStorage.getItem("username");
        dispatch({ type: "RESTORE_TOKEN", payload: { token: username, username } });
      } catch {
        dispatch({ type: "RESTORE_TOKEN", payload: { token: null, username: null } });
      }
    };
    bootstrapAsync();
  }, []);

  const authContext: AuthContextType = {
    state,

    signIn: async (username: string, password: string) => {
      dispatch({ type: "SIGN_IN_START" });
      try {
        if (!username.trim() || !password.trim()) throw new Error("用户名和密码不能为空");
        // zjuLogin handles CAS auth, saves session + credentials internally
        const session = await zjuLogin(username.trim(), password);
        dispatch({
          type: "SIGN_IN_SUCCESS",
          payload: { token: session.username, username: session.username },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "登录失败";
        dispatch({ type: "SIGN_IN_FAILURE", payload: { error: errorMessage } });
        throw error;
      }
    },

    signOut: async () => {
      try {
        // Clear native session & SecureStore credentials
        await clearSession();
        // Clear all local schedule caches
        const keys = await AsyncStorage.getAllKeys();
        const toRemove = keys.filter(k =>
          k.startsWith("schedule_") ||
          k.startsWith("activeSemesters_") ||
          k.startsWith("lastSelectedSemester_") ||
          k === "courses" ||
          k === "username"
        );
        if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
        dispatch({ type: "SIGN_OUT" });
      } catch (error) {
        console.error("Sign out error:", error);
        throw error;
      }
    },
  };

  return <AuthContext.Provider value={authContext}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
