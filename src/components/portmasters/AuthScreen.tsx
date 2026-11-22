"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  Anchor,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { api, type PublicUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_NAME } from "@/lib/game/constants";
import { useSound } from "@/lib/use-sound";
import { ThemeToggle } from "./ThemeToggle";

type AuthMode = "login" | "register";

export function AuthScreen({
  onAuthed,
}: {
  onAuthed: (user: PublicUser, token: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { play } = useSound();

  const isLogin = mode === "login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const { user, token } = isLogin
        ? await api.login({ username: username.trim(), password })
        : await api.register({
            username: username.trim(),
            password,
            displayName: displayName.trim() || undefined,
          });

      play("success");
      onAuthed(user, token);
    } catch (caughtError) {
      play("error");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pm-auth-shell relative min-h-dvh w-full overflow-x-hidden text-slate-950 dark:text-slate-50">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div className="absolute right-4 top-4 z-20 rounded-full border border-slate-900/10 bg-white/80 p-1 shadow-sm backdrop-blur sm:right-6 sm:top-6 dark:border-white/10 dark:bg-slate-950/60">
        <ThemeToggle />
      </div>

      <main className="pm-auth-main relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl items-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section
          className="pm-auth-layout grid min-w-0 w-full overflow-hidden rounded-3xl border border-slate-900/10 bg-white/95 shadow-[0_24px_80px_rgba(25,45,50,0.12)] backdrop-blur-sm lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] dark:border-white/10 dark:bg-[#111d21]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
          aria-labelledby="auth-brand"
        >
          <div className="pm-auth-brand relative min-w-0 overflow-hidden bg-[#163b42] px-6 py-6 text-white sm:px-10 sm:py-8 lg:flex lg:min-h-[36rem] lg:flex-col lg:justify-between lg:p-12">
            <div
              className="relative flex items-center gap-3 text-sm text-white/75"
              aria-hidden="true"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
                <Anchor className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>

            <div className="relative mt-7 lg:mt-0">
              <h1
                id="auth-brand"
                className="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-0 lg:block"
              >
                <span className="sr-only">{APP_NAME}</span>
                <span
                  aria-hidden="true"
                  className="block whitespace-nowrap break-normal pb-2 text-[clamp(2.15rem,10vw,4.5rem)] font-semibold leading-none tracking-normal lg:pb-0 lg:text-[clamp(2.75rem,4vw,3.5rem)]"
                >
                  PortMasters
                </span>
                <span
                  aria-hidden="true"
                  className="block text-[clamp(8rem,33vw,15rem)] font-black leading-[1.18] tracking-normal text-[var(--brand-highlight)] lg:mt-2"
                >
                  2
                </span>
              </h1>
              <p className="mt-5 text-base font-medium text-white/90 sm:text-lg lg:mt-8">
                Lords of the Silk Road
              </p>
            </div>
          </div>

          <div className="pm-auth-form min-w-0 px-5 py-7 sm:px-10 sm:py-9 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-12">
            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as AuthMode);
                setError(null);
              }}
              className="min-w-0 gap-0"
            >
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
                <TabsTrigger
                  value="login"
                  className="rounded-lg text-sm data-[state=active]:shadow-sm"
                >
                  Sign in
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="rounded-lg text-sm data-[state=active]:shadow-sm"
                >
                  Create account
                </TabsTrigger>
              </TabsList>

              <div className="pm-auth-heading mb-5 mt-6 sm:mb-7 sm:mt-8">
                <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                  {isLogin ? "Welcome back" : "Join the harbor"}
                </h2>
              </div>

              <form onSubmit={submit} className="space-y-4 sm:space-y-5">
                <TabsContent
                  value="login"
                  className="mt-0 space-y-4 sm:space-y-5"
                >
                  <Field id="loginUsername" label="Captain name">
                    <Input
                      id="loginUsername"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Enter your captain name"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={20}
                      required
                      className={inputClassName}
                    />
                  </Field>
                  <Field id="loginPassword" label="Password">
                    <PasswordInput
                      id="loginPassword"
                      value={password}
                      onChange={setPassword}
                      show={showPassword}
                      onToggle={() => setShowPassword((visible) => !visible)}
                      autoComplete="current-password"
                    />
                  </Field>
                </TabsContent>

                <TabsContent
                  value="register"
                  className="mt-0 space-y-4 sm:space-y-5"
                >
                  <Field
                    id="registerUsername"
                    label="Captain name"
                    hint="Use 3 to 20 letters, numbers, or underscores."
                  >
                    <Input
                      id="registerUsername"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Choose a captain name"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      minLength={3}
                      maxLength={20}
                      pattern="[A-Za-z0-9_]+"
                      required
                      aria-describedby="registerUsernameHint"
                      className={inputClassName}
                    />
                  </Field>
                  <Field
                    id="registerDisplayName"
                    label="Display name"
                    hint="Optional. Other captains will see this name."
                  >
                    <Input
                      id="registerDisplayName"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Captain Mei"
                      autoComplete="nickname"
                      maxLength={24}
                      aria-describedby="registerDisplayNameHint"
                      className={inputClassName}
                    />
                  </Field>
                  <Field
                    id="registerPassword"
                    label="Password"
                    hint="Use at least 6 characters."
                  >
                    <PasswordInput
                      id="registerPassword"
                      value={password}
                      onChange={setPassword}
                      show={showPassword}
                      onToggle={() => setShowPassword((visible) => !visible)}
                      autoComplete="new-password"
                      minLength={6}
                      describedBy="registerPasswordHint"
                    />
                  </Field>
                </TabsContent>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex min-w-0 items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
                  >
                    <CircleAlert
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading || !username.trim() || !password}
                  aria-busy={loading}
                  className="h-12 w-full rounded-xl bg-[#2f7177] px-5 text-sm font-semibold text-white shadow-none hover:bg-[#285f64] hover:shadow-md dark:bg-[#5aa8a4] dark:text-[#102c31] dark:hover:bg-[#70b9b3]"
                >
                  {loading ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      {isLogin ? "Signing in" : "Creating account"}
                    </>
                  ) : (
                    <>
                      {isLogin ? "Sign in" : "Create account"}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>
            </Tabs>
          </div>
        </section>
      </main>
    </div>
  );
}

const inputClassName =
  "h-11 rounded-xl border-slate-200 bg-white px-4 shadow-none focus-visible:border-[#39757c] focus-visible:ring-[#39757c]/15 sm:h-12 dark:border-white/10 dark:bg-white/[0.04]";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && (
          <p
            id={`${id}Hint`}
            className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500"
          >
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  minLength,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  minLength?: number;
  describedBy?: string;
}) {
  return (
    <div className="relative min-w-0">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter your password"
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={72}
        required
        aria-describedby={describedBy}
        className={`${inputClassName} pr-12`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39757c]/40 dark:hover:bg-white/10 dark:hover:text-white"
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
