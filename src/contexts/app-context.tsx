"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { getConfigError, getSupabaseClient } from "@/lib/supabase";
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

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    if (!supabase) {
      setAuthError(getConfigError() ?? "Missing Supabase environment variables.");
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    async function bootstrap() {
      try {
        setLoading(true);
        const client = supabase;

        if (!client) {
          throw new Error("Missing Supabase environment variables.");
        }

        const { data, error } = await withTimeout(
          client.auth.getUser(),
          "Supabase auth request timed out while loading the session.",
        );
        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const currentUser = data.user ?? null;
        setUser(currentUser);
        const { data: sessionData } = await withTimeout(
          client.auth.getSession(),
          "Supabase session request timed out while loading the session.",
        );
        setSession(sessionData.session);
        setAuthId(currentUser?.id ?? null);

        if (!currentUser) {
          setClientId(null);
          setTabs([]);
          setLoading(false);
          router.replace("/login");
          return;
        }

        const resolvedClientId = await withTimeout(
          getClientIdForAuthUser(currentUser.id),
          "Client lookup timed out while loading the session.",
        );
        if (!isMounted) {
          return;
        }

        setClientId(resolvedClientId);

        if (!resolvedClientId) {
          setClientError("Client not mapped");
          setTabs([]);
          setLoading(false);
          return;
        }

        const nextTabs = await withTimeout(
          getTabs(resolvedClientId),
          "Tab lookup timed out while loading the session.",
        );
        if (!isMounted) {
          return;
        }

        setTabs(nextTabs.filter((tab) => tab.visible));
        setActiveTabId((current) => {
          const nextVisibleTabs = nextTabs.filter((tab) => tab.visible);
          return nextVisibleTabs.some((tab) => tab.id === current)
            ? current
            : nextVisibleTabs[0]?.id ?? "summary";
        });
        setClientError(null);
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
        setLoading(true);
        try {
          setSession(nextSession);
          const nextUser = nextSession?.user ?? null;
          setUser(nextUser);
          setAuthId(nextUser?.id ?? null);

          if (!nextUser) {
            setClientId(null);
            setTabs([]);
            setClientError(null);
            router.replace("/login");
            return;
          }

          const resolvedClientId = await withTimeout(
            getClientIdForAuthUser(nextUser.id),
            "Client lookup timed out after authentication.",
          );
          setClientId(resolvedClientId);

          if (!resolvedClientId) {
            setClientError("Client not mapped");
            setTabs([]);
            return;
          }

          const nextTabs = await withTimeout(
            getTabs(resolvedClientId),
            "Tab lookup timed out after authentication.",
          );
          setTabs(nextTabs.filter((tab) => tab.visible));
          setActiveTabId((current) => {
            const nextVisibleTabs = nextTabs.filter((tab) => tab.visible);
            return nextVisibleTabs.some((tab) => tab.id === current)
              ? current
              : nextVisibleTabs[0]?.id ?? "summary";
          });
          setClientError(null);
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
      throw new Error(getConfigError() ?? "Missing Supabase environment variables.");
    }

    setAuthError(null);
    setClientError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw error;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    const resolvedUser = userData.user ?? null;
    setUser(resolvedUser);
    setAuthId(resolvedUser?.id ?? null);
  }

  async function signOut() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setSession(null);
      setUser(null);
      setAuthId(null);
      setClientId(null);
      setTabs([]);
      setActiveTabId("summary");
      setAuthError(getConfigError() ?? "Missing Supabase environment variables.");
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setAuthId(null);
    setClientId(null);
    setTabs([]);
    setActiveTabId("summary");
    setAuthError(null);
    setClientError(null);
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