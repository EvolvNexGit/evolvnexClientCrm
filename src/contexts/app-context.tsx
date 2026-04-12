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

function isSupabaseLockAbort(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  return error.message.includes("Lock broken by another request");
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

  async function hydrateFromUser(nextUser: User | null) {
    setUser(nextUser);
    setAuthId(nextUser?.id ?? null);

    if (!nextUser) {
      setClientId(null);
      setTabs([]);
      setClientError(null);
      return;
    }

    const resolvedClientId = await getClientIdForAuthUser(nextUser.id);
    setClientId(resolvedClientId);

    if (!resolvedClientId) {
      setClientError("Client not mapped");
      setTabs([]);
      return;
    }

    const nextTabs = await getTabs(resolvedClientId);
    setTabs(nextTabs.filter((tab) => tab.visible));
    setActiveTabId((current) => {
      const nextVisibleTabs = nextTabs.filter((tab) => tab.visible);
      return nextVisibleTabs.some((tab) => tab.id === current) ? current : nextVisibleTabs[0]?.id ?? "summary";
    });
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
        const client = supabase;

        if (!client) {
          throw new Error("Missing Supabase environment variables.");
        }

        const { data, error } = await client.auth.getSession();
        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const nextSession = data.session;
        setSession(nextSession);
        const currentUser = nextSession?.user ?? null;
        await hydrateFromUser(currentUser);

        if (!currentUser) {
          setLoading(false);
          router.replace("/login");
          return;
        }
        setLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (isSupabaseLockAbort(error)) {
          // A competing request stole the lock; auth state listener will hydrate the latest session.
          setLoading(false);
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
          setSession(nextSession);
          await hydrateFromUser(nextSession?.user ?? null);

          if (!nextSession?.user) {
            router.replace("/login");
          }
        } catch (error) {
          if (isSupabaseLockAbort(error)) {
            return;
          }

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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw error;
    }

    const resolvedUser = data.user ?? null;
    setSession(data.session ?? null);
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
      setAuthError("Missing Supabase environment variables.");
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