import React, { createContext, useReducer, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

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
  signUp?: (username: string, password: string) => Promise<void>;
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
      return {
        ...state,
        userToken: action.payload.token,
        username: action.payload.username,
        isLoading: false,
      };
    case "SIGN_IN_START":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "SIGN_IN_SUCCESS":
      return {
        ...state,
        isSignout: false,
        userToken: action.payload.token,
        username: action.payload.username,
        isLoading: false,
        error: null,
      };
    case "SIGN_IN_FAILURE":
      return {
        ...state,
        isLoading: false,
        error: action.payload.error,
      };
    case "SIGN_OUT":
      return {
        ...state,
        isSignout: true,
        userToken: null,
        username: null,
      };
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

  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const token = await AsyncStorage.getItem("userToken");
        const username = await AsyncStorage.getItem("username");
        dispatch({ type: "RESTORE_TOKEN", payload: { token, username } });
      } catch (e) {
        console.error("Failed to restore token:", e);
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
        if (!username || !password) {
          throw new Error("用户名和密码不能为空");
        }

        // 调用后端 CAS 登录 API
        const apiBaseUrl = getApiBaseUrl();
        console.log("[Auth] API Base URL:", apiBaseUrl);
        console.log("[Auth] Platform:", typeof window !== "undefined" ? "web" : "native");
        if (typeof window !== "undefined" && window.location) {
          console.log("[Auth] Window location:", window.location.href);
        }
        const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "登录失败");
        }

        // 生成 token 并保存
        const token = `token_${Date.now()}`;

        await AsyncStorage.setItem("userToken", token);
        await AsyncStorage.setItem("username", username);

        dispatch({
          type: "SIGN_IN_SUCCESS",
          payload: { token, username },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "登录失败";
        console.error("Sign in error:", error);
        dispatch({
          type: "SIGN_IN_FAILURE",
          payload: { error: errorMessage },
        });
        throw error;
      }
    },

    signOut: async () => {
      try {
        const apiBaseUrl = getApiBaseUrl();
        const username = state.username;

        // 1. 调用课表服务的退出登录 API，销毁浏览器实例并清除课表缓存
        await fetch(`${apiBaseUrl}/api/schedule/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username }),
        }).catch(err => console.error("课表服务登出请求失败", err));

        // 2. 调用系统认证的退出登录 API，清除会话 Cookie
        await fetch(`${apiBaseUrl}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username }),
        }).catch(err => console.error("系统认证登出请求失败", err));

        // 2. 清理所有本地存储的课表缓存
        const keys = await AsyncStorage.getAllKeys();
        const scheduleKeys = keys.filter(key => key.startsWith("schedule_") || key === "courses");
        if (scheduleKeys.length > 0) {
          await AsyncStorage.multiRemove(scheduleKeys);
        }

        // 3. 清理用户凭证
        await AsyncStorage.removeItem("userToken");
        await AsyncStorage.removeItem("username");
        
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
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
