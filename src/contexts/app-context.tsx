"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { getClientIdForAuthUser } from "@/lib/client-cache";
import { getTabs } from "@/lib/tabs";
import type { TabDefinition } from "@/lib/types";

type AppContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  authId: string | null;
  clientId: string | null;
  tabs: TabDefinition[];
  activeTabId: string;
  authError: string | null;
  clientError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveTabId: (tabId: string) => void;
  refreshTabs: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const REQUEST_TIMEOUT_MS = 10000;

async function withTimeout<T>(promise: Promise<T>, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<TabDefinition[]>([]);
  const [activeTabId, setActiveTabId] = useState("summary");
  const [authError, setAuthError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  function applyVisibleTabs(nextTabs: TabDefinition[]) {
    const visibleTabs = nextTabs.filter((tab) => tab.visible);
    setTabs(visibleTabs);
    setActiveTabId((current) =>
      visibleTabs.some((tab) => tab.id === current) ? current : visibleTabs[0]?.id ?? "summary",
    );
  }

  function resetClientState(errorMessage: string | null = null) {
    setClientId(null);
    setTabs([]);
    setClientError(errorMessage);
  }

  function applySessionSnapshot(nextSession: Session | null) {
    const nextUser = nextSession?.user ?? null;
    setSession(nextSession);
    setUser(nextUser);
    setAuthId(nextUser?.id ?? null);
    return nextUser;
  }

  async function hydrateClientData(nextUser: User | null) {
    if (!nextUser) {
      resetClientState();
      return;
    }

    const resolvedClientId = await withTimeout(
      getClientIdForAuthUser(nextUser.id),
      "Client lookup timed out.",
    );
    setClientId(resolvedClientId);

    if (!resolvedClientId) {
      setTabs([]);
      setClientError("Client not mapped");
      return;
    }

    const nextTabs = await withTimeout(getTabs(resolvedClientId), "Tab loading timed out.");
    applyVisibleTabs(nextTabs);
    setClientError(null);
  }

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    if (!supabase) {
      setAuthError("Missing Supabase environment variables.");
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    async function bootstrap() {
      try {
        setLoading(true);
        setAuthError(null);
        const client = supabase;

        if (!client) {
          throw new Error("Missing Supabase environment variables.");
        }

        const { data, error } = await withTimeout(
          client.auth.getSession(),
          "Session lookup timed out.",
        );
        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const currentUser = applySessionSnapshot(data.session);

        if (!currentUser) {
          await hydrateClientData(null);
          setLoading(false);
          router.replace("/login");
          return;
        }

        await hydrateClientData(currentUser);

        if (!isMounted) {
          return;
        }
        setLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Unable to load session.");
        setLoading(false);
      }
    }

    bootstrap();

    const client = supabase;
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        try {
          setLoading(true);
          const nextUser = applySessionSnapshot(nextSession);
          await hydrateClientData(nextUser);

          if (!nextUser) {
            router.replace("/login");
          }
        } catch (error) {
          setClientError(error instanceof Error ? error.message : "Unable to resolve client.");
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      })();
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function signIn(email: string, password: string) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error("Missing Supabase environment variables.");
    }

    setAuthError(null);
    setClientError(null);
    setLoading(true);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        "Login request timed out.",
      );

      if (error) {
        throw error;
      }

      const nextSession = data.session ?? null;
      const nextUser = applySessionSnapshot(nextSession);

      if (!nextSession || !nextUser) {
        throw new Error("Login succeeded but no active session was returned.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setSession(null);
      setUser(null);
      setAuthId(null);
      resetClientState();
      setActiveTabId("summary");
      setAuthError("Missing Supabase environment variables.");
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setAuthId(null);
    resetClientState();
    setActiveTabId("summary");
    setAuthError(null);
    router.replace("/login");
  }

  async function refreshTabs() {
    if (!clientId) {
      setTabs([]);
      return;
    }

    const nextTabs = await getTabs(clientId);
    setTabs(nextTabs.filter((tab) => tab.visible));
  }

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      session,
      user,
      authId,
      clientId,
      tabs,
      activeTabId,
      authError,
      clientError,
      signIn,
      signOut,
      setActiveTabId,
      refreshTabs,
    }),
    [activeTabId, authError, clientError, authId, clientId, loading, session, tabs, user],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);

  if (!value) {
    throw new Error("useApp must be used within AppProvider");
  }

  return value;
}

export function useAuth() {
  const { loading, session, user, authId, authError, signIn, signOut } = useApp();
  return { loading, session, user, authId, authError, signIn, signOut };
}

export function useClient() {
  const { clientId, clientError } = useApp();
  return { clientId, clientError };
}