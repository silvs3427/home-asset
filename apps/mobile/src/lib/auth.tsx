import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
  type AppFace,
  type PublicUser,
} from "./api";

const TOKEN_KEY = "homeasset.accessToken";

type AuthState = {
  ready: boolean;
  user: PublicUser | null;
  accessToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    startingFace?: AppFace,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function saveToken(token: string | null) {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) return;
        const me = await fetchMe(stored);
        if (cancelled) return;
        setAccessToken(stored);
        setUser(me.user);
      } catch {
        await saveToken(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = useCallback(async (token: string, nextUser: PublicUser) => {
    await saveToken(token);
    setAccessToken(token);
    setUser(nextUser);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin({ email, password });
      await applySession(res.accessToken, res.user);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (email: string, password: string, startingFace: AppFace = "homeowner") => {
      const res = await apiSignup({ email, password, startingFace });
      await applySession(res.accessToken, res.user);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    await saveToken(null);
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ ready, user, accessToken, signIn, signUp, signOut }),
    [ready, user, accessToken, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
