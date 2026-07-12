"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthBanner } from "@/components/auth-banner";
import { AuthShell } from "@/components/auth-shell";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await signUp.email({ name, username, email, password });

    if (error) {
      setError(error.message ?? "Failed to sign up");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell banner={<AuthBanner />}>
      <div className="mb-6 flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm">
          Get started with Open Browser in seconds.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Ada Lovelace"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="ada"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="ada@example.com"
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
            autoComplete="new-password"
            placeholder="••••••••"
            required
          />
        </div>
        <Button type="submit" className="mt-1 w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground font-medium underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
