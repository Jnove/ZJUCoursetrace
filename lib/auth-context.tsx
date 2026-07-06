/**
 * lib/auth-context.tsx
 *
 * Uses zju-client directly — no backend server needed.
 * Authentication state is stored in native cookie jar (by zju-client)
 * and the username in AsyncStorage. userToken = username (non-null = logged in).
 */
import React, { createContext, useReducer, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login as zjuLogin, loadSession, clearSession, fetchStudentName, loadStoredStudentName } from "@/lib/zju-client";

export type AuthState = {
  isLoading: boolean;
  isSignout: boolean;
  userToken: string | null;
  username: string | null;
  /** 学生姓名（登录后从用户信息页解析并缓存，可能晚于 username 到达） */
  name: string | null;
  error: string | null;
};

export type AuthContextType = {
  state: AuthState;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: "RESTORE_TOKEN"; payload: { token: string | null; username: string | null; name: string | null } }
  | { type: "SIGN_IN_START" }
  | { type: "SIGN_IN_SUCCESS"; payload: { token: string; username: string } }
  | { type: "SIGN_IN_FAILURE"; payload: { error: string } }
  | { type: "SET_NAME"; payload: { name: string } }
  | { type: "SIGN_OUT" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "RESTORE_TOKEN":
      return { ...state, userToken: action.payload.token, username: action.payload.username, name: action.payload.name, isLoading: false };
    case "SIGN_IN_START":
      return { ...state, isLoading: true, error: null };
    case "SIGN_IN_SUCCESS":
      return { ...state, isSignout: false, userToken: action.payload.token, username: action.payload.username, isLoading: false, error: null };
    case "SIGN_IN_FAILURE":
      return { ...state, isLoading: false, error: action.payload.error };
    case "SET_NAME":
      return { ...state, name: action.payload.name };
    case "SIGN_OUT":
      return { ...state, isSignout: true, userToken: null, username: null, name: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    isLoading: true,
    isSignout: false,
    userToken: null,
    username: null,
    name: null,
    error: null,
  });

  // On cold start: check if username is stored (fast, no network).
  // Actual session validity is checked lazily when data is fetched;
  // withRelogin in zju-client handles expired sessions transparently.
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const username = await AsyncStorage.getItem("username");
        const name = await loadStoredStudentName();
        dispatch({ type: "RESTORE_TOKEN", payload: { token: username, username, name } });
        // 已登录但没有缓存姓名（老用户升级）：后台补拉一次，不阻塞冷启动
        if (username && !name) {
          fetchStudentName(username)
            .then(n => { if (n) dispatch({ type: "SET_NAME", payload: { name: n } }); })
            .catch(() => {});
        }
      } catch {
        dispatch({ type: "RESTORE_TOKEN", payload: { token: null, username: null, name: null } });
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
        // 后台拉取姓名，不阻塞登录完成
        fetchStudentName(session.username)
          .then(n => { if (n) dispatch({ type: "SET_NAME", payload: { name: n } }); })
          .catch(() => {});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "登录失败";
        dispatch({ type: "SIGN_IN_FAILURE", payload: { error: errorMessage } });
        throw error;
      }
    },

    signOut: async () => {
      try {
        await clearSession();

        //  清除 AsyncStorage 中除个性化设置外的所有数据
        const keys = await AsyncStorage.getAllKeys();
        const toRemove = keys.filter(k => 
          !k.startsWith("pref_") // 保留以 pref_ 开头的个性化配置
        );
        if (toRemove.length > 0) {
          await AsyncStorage.multiRemove(toRemove);
        }

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
