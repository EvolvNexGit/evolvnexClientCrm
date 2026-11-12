"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Eye,
  EyeOff,
  GraduationCap,
  Globe2,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/contexts/app-context";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATS = [
  { icon: TrendingUp, value: "500+", label: "Businesses helped to grow" },
  { icon: Globe2, value: "5+", label: "Industries served with expertise" },
];

const INDUSTRY_ICONS = [Briefcase, ShoppingCart, HeartPulse, GraduationCap, Building2];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white py-3 pl-11 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20";

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
      router.replace("/");
    }
  }, [loading, router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      await signIn(email, password);
      router.replace("/");
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
    <main className="min-h-dvh bg-black lg:grid lg:grid-cols-2">
      <section className="flex min-w-0 flex-col gap-6 bg-black px-6 pb-8 pt-6 text-white lg:justify-between lg:gap-8 lg:px-12 lg:py-10 xl:px-16">
        <BrandLogo className="h-auto w-44 sm:w-52" width={1192} height={137} priority />

        <div>
          <h1 className="max-w-xl text-2xl font-bold leading-tight sm:text-3xl xl:text-4xl">
            A CRM that adapts to <span className="text-primary">your business,</span> dedicated to{" "}
            <span className="text-primary">growth.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">
            EvolvNex CRM is a secure, flexible foundation that moulds to the way you work—so you can
            build stronger relationships and grow your business.
          </p>

          {/* Marketing stats + trust strip only from lg so the sign-in form is visible on phones without scrolling. */}
          <div className="mt-8 hidden gap-4 sm:grid-cols-2 lg:grid">
            {STATS.map(({ icon: Icon, value, label }) => (
              <div
                key={value}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xl font-semibold">{value}</div>
                  <div className="text-sm text-slate-300">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden space-y-6 lg:block">
          <div className="border-t border-white/10 pt-6 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
              Trusted by growing businesses across industries
            </p>
            <div className="mt-5 flex items-center text-slate-300">
              {INDUSTRY_ICONS.map((Icon, index) => (
                <span
                  key={index}
                  className={cn("flex flex-1 justify-center", index > 0 && "border-l border-white/10")}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-4 border-t border-white/10 pt-6 lg:flex">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="text-sm text-slate-300">
              <p>Your data is secure, compliant, and in safe hands.</p>
              <p className="mt-0.5 text-slate-400">
                SOC 2 ready • GDPR aligned • Hosted on <span className="text-primary">Supabase</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-t-3xl bg-white px-6 py-10 text-slate-950 lg:grid lg:place-items-center lg:rounded-none lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Sign in</p>
          <h2 className="mt-3 text-3xl font-semibold">Welcome back</h2>
          <p className="mt-2 text-base text-slate-600">Sign in to continue to EvolvNex CRM.</p>

          {(authError || formError) && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-base text-rose-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError ?? authError}</span>
            </div>
          )}

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-base font-medium">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  className={cn(INPUT_CLASS, "pr-4")}
                  placeholder="Enter your email"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-base font-medium">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className={cn(INPUT_CLASS, "pr-12")}
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

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-primary" />
                Remember me
              </label>
              <button
                type="button"
                disabled
                className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Forgot password?
              </button>
            </div>

            <Button className="w-full rounded-lg py-3" type="submit" disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-4 text-sm text-slate-600">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            disabled
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create a new account
          </button>

          <p className="mt-6 text-center text-sm text-slate-600">
            By continuing, you agree to our <span className="text-primary">Terms of Service</span> and{" "}
            <span className="text-primary">Privacy Policy</span>.
          </p>
        </div>
      </section>
    </main>
  );
}
