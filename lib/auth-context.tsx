import React, { createContext, useContext, useReducer, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AuthState {
  isLoading: boolean;
  isSignout: boolean;
  userToken: string | null;
  username: string | null;
  error: string | null;
}

type AuthAction =
  | { type: "RESTORE_TOKEN"; payload: { token: string | null; username: string | null } }
  | { type: "SIGN_IN_START" }
  | { type: "SIGN_IN_SUCCESS"; payload: { token: string; username: string } }
  | { type: "SIGN_IN_FAILURE"; payload: string }
  | { type: "SIGN_OUT" }
  | { type: "CLEAR_ERROR" };

const initialState: AuthState = {
  isLoading: true,
  isSignout: false,
  userToken: null,
  username: null,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "RESTORE_TOKEN":
      return {
        isLoading: false,
        isSignout: false,
        userToken: action.payload.token,
        username: action.payload.username,
        error: null,
      };
    case "SIGN_IN_START":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "SIGN_IN_SUCCESS":
      return {
        isLoading: false,
        isSignout: false,
        userToken: action.payload.token,
        username: action.payload.username,
        error: null,
      };
    case "SIGN_IN_FAILURE":
      return {
        isLoading: false,
        isSignout: false,
        userToken: null,
        username: null,
        error: action.payload,
      };
    case "SIGN_OUT":
      return {
        isLoading: false,
        isSignout: true,
        userToken: null,
        username: null,
        error: null,
      };
    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

interface AuthContextType {
  state: AuthState;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // 启动时恢复token
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
        // 这里应该调用实际的登录API或脚本
        // 目前使用模拟实现
        if (!username || !password) {
          throw new Error("用户名和密码不能为空");
        }

        // 模拟登录延迟
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 生成模拟token
        const token = `token_${Date.now()}`;
        
        await AsyncStorage.setItem("userToken", token);
        await AsyncStorage.setItem("username", username);
        
        dispatch({
          type: "SIGN_IN_SUCCESS",
          payload: { token, username },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "登录失败";
        dispatch({
          type: "SIGN_IN_FAILURE",
          payload: errorMessage,
        });
        throw error;
      }
    },
    signOut: async () => {
      try {
        await AsyncStorage.removeItem("userToken");
        await AsyncStorage.removeItem("username");
        dispatch({ type: "SIGN_OUT" });
      } catch (error) {
        console.error("Sign out error:", error);
      }
    },
    clearError: () => {
      dispatch({ type: "CLEAR_ERROR" });
    },
  };

  return <AuthContext.Provider value={authContext}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
