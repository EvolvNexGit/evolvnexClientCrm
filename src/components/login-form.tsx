"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const { loading, user, authError, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message.includes("Invalid login credentials") ? "Invalid credentials" : error.message);
      } else {
        setFormError("Unable to sign in.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-dashboard-gradient px-4 py-8">
      <section className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-white/70 bg-slate-950 p-8 text-white shadow-soft">
          <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
            Evolvnex CRM
          </div>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
            A client-scoped CRM foundation built for future tab logic.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            Supabase Auth, safe client mapping, and dynamic sidebar tabs are wired as reusable
            primitives rather than one-off screens.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Auth", "Email and password login"],
              ["Mapping", "Resolve client_id before queries"],
              ["Tabs", "Driven entirely by config"],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium">{title}</div>
                <div className="mt-1 text-sm text-slate-300">{description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white p-8 shadow-soft">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Sign in
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">Use your Supabase credentials to continue.</p>
          </div>

          {(authError || formError) && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError ?? authError}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white"
                placeholder="you@company.com"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <div className="relative">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 transition hover:text-slate-800"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <Button className="w-full rounded-2xl py-3" type="submit" disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in
                </span>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}