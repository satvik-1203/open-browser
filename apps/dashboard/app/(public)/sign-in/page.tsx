"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthBanner } from "@/components/auth-banner";
import { AuthShell } from "@/components/auth-shell";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await signIn.username({ username, password });

    if (error) {
      setError(error.message ?? "Failed to sign in");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell banner={<AuthBanner />}>
      <div className="mb-6 flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to your Open Browser account.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="yourname"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
        <Button type="submit" className="mt-1 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-foreground font-medium underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
