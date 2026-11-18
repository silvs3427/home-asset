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
  createProperty as apiCreateProperty,
  fetchMe,
  login as apiLogin,
  selectProperty as apiSelectProperty,
  signup as apiSignup,
  switchFace as apiSwitchFace,
  type AppFace,
  type CreatePropertyInput,
  type PublicProperty,
  type PublicUser,
} from "./api";
import { SUPABASE_CONFIGURED } from "./config";

const TOKEN_KEY = "homeasset.accessToken";

type AuthState = {
  ready: boolean;
  user: PublicUser | null;
  accessToken: string | null;
  properties: PublicProperty[];
  activeProperty: PublicProperty | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    startingFace?: AppFace,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshHomes: () => Promise<void>;
  addHome: (input: CreatePropertyInput) => Promise<PublicProperty>;
  selectHome: (propertyId: string) => Promise<void>;
  setFace: (face: AppFace) => Promise<void>;
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
  const [properties, setProperties] = useState<PublicProperty[]>([]);
  const [activeProperty, setActiveProperty] = useState<PublicProperty | null>(
    null,
  );

  const applyMe = useCallback(
    (token: string, me: Awaited<ReturnType<typeof fetchMe>>) => {
      setAccessToken(token);
      setUser(me.user);
      setProperties(me.properties);
      setActiveProperty(me.activeProperty);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (SUPABASE_CONFIGURED) {
          // LightLift-style: restore from Supabase AsyncStorage session.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { cloudGetSession } = require("./cloud") as typeof import("./cloud");
          const session = await cloudGetSession();
          if (!session?.access_token) return;
          const me = await fetchMe(session.access_token);
          if (cancelled) return;
          await saveToken(session.access_token);
          applyMe(session.access_token, me);
          return;
        }

        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) return;
        const me = await fetchMe(stored);
        if (cancelled) return;
        applyMe(stored, me);
      } catch {
        await saveToken(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMe]);

  const applySession = useCallback(
    async (token: string, nextUser: PublicUser) => {
      await saveToken(token);
      setAccessToken(token);
      setUser(nextUser);
      const me = await fetchMe(token);
      setProperties(me.properties);
      setActiveProperty(me.activeProperty);
      setUser(me.user);
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin({ email, password });
      await applySession(res.accessToken, res.user);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      startingFace: AppFace = "homeowner",
    ) => {
      const res = await apiSignup({ email, password, startingFace });
      await applySession(res.accessToken, res.user);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    if (SUPABASE_CONFIGURED) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { cloudSignOut } = require("./cloud") as typeof import("./cloud");
        await cloudSignOut();
      } catch {
        // Still clear local state if cloud sign-out fails.
      }
    }
    await saveToken(null);
    setAccessToken(null);
    setUser(null);
    setProperties([]);
    setActiveProperty(null);
  }, []);

  const refreshHomes = useCallback(async () => {
    if (!accessToken) return;
    const me = await fetchMe(accessToken);
    setUser(me.user);
    setProperties(me.properties);
    setActiveProperty(me.activeProperty);
  }, [accessToken]);

  const addHome = useCallback(
    async (input: CreatePropertyInput) => {
      if (!accessToken) throw new Error("Sign in required.");
      const res = await apiCreateProperty(accessToken, input);
      if (res.user) setUser(res.user);
      await refreshHomes();
      return res.property;
    },
    [accessToken, refreshHomes],
  );

  const selectHome = useCallback(
    async (propertyId: string) => {
      if (!accessToken) throw new Error("Sign in required.");
      const res = await apiSelectProperty(accessToken, propertyId);
      if (res.user) setUser(res.user);
      setActiveProperty(res.property);
      setProperties((prev) => {
        const others = prev.filter((p) => p.id !== res.property.id);
        return [...others, res.property].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        );
      });
    },
    [accessToken],
  );

  const setFace = useCallback(
    async (face: AppFace) => {
      if (!accessToken) throw new Error("Sign in required.");
      const res = await apiSwitchFace(accessToken, face, true);
      await saveToken(res.accessToken);
      setAccessToken(res.accessToken);
      setUser(res.user);
    },
    [accessToken],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      accessToken,
      properties,
      activeProperty,
      signIn,
      signUp,
      signOut,
      refreshHomes,
      addHome,
      selectHome,
      setFace,
    }),
    [
      ready,
      user,
      accessToken,
      properties,
      activeProperty,
      signIn,
      signUp,
      signOut,
      refreshHomes,
      addHome,
      selectHome,
      setFace,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
