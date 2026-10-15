"use client";
import { useState } from "react";
import { createAuthClient } from "@neondatabase/auth/next";
import type { messages } from "@/lib/i18n";

const authClient = createAuthClient();
type Messages = (typeof messages)[keyof typeof messages];

export function Controls({
  messages: m,
  mode,
  configured = true,
}: {
  messages: Messages;
  mode: "signIn" | "check" | "denied";
  configured?: boolean;
}) {
  const [pending, setPending] = useState<"signIn" | "signOut" | "check" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function signIn() {
    if (!configured) {
      setError(m.setup);
      return;
    }
    setPending("signIn");
    setError(null);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${location.origin}/check`,
      });
      if (error) {
        setError(m.errors.auth);
        setPending(null);
      }
    } catch (e) {
      setError(e instanceof TypeError ? m.errors.network : m.errors.auth);
      setPending(null);
    }
  }
  async function signOut() {
    setPending("signOut");
    setError(null);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setError(m.errors.network);
        setPending(null);
        return;
      }
      location.assign("/");
    } catch {
      setError(m.errors.network);
      setPending(null);
    }
  }
  async function runCheck() {
    setPending("check");
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await res.json();
      if (!res.ok || result.ok !== true) {
        const code = result.error as keyof Messages["errors"];
        setError(m.errors[code] ?? m.errors.unavailable);
      } else {
        setSuccess(true);
      }
    } catch {
      setError(m.errors.network);
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      {mode === "signIn" ? (
        <button
          className="primary"
          disabled={pending !== null}
          onClick={signIn}
        >
          {pending === "signIn" ? m.signingIn : m.signIn}
        </button>
      ) : (
        <>
          {mode === "check" ? (
            <button
              className="primary"
              disabled={pending !== null}
              onClick={runCheck}
            >
              {pending === "check" ? m.checking : m.check}
            </button>
          ) : null}
          <div>
            <button
              className="secondary"
              disabled={pending !== null}
              onClick={signOut}
            >
              {pending === "signOut" ? m.signingOut : m.signOut}
            </button>
          </div>
        </>
      )}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <output className="notice success">{m.success}</output> : null}
    </>
  );
}
