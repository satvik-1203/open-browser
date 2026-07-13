"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { AlertTriangle, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "../copy-button";
import { formatDateTime, timeAgo } from "../format";
import { PanelHeader } from "../panel-header";
import {
  useCreateToken,
  useRevokeToken,
  useTokensQuery,
} from "@/lib/dashboard/queries";
import type { CreatedApiToken } from "@/lib/dashboard/types";

export function ApiKeysPanel() {
  const tokensQuery = useTokensQuery();
  const createMut = useCreateToken();
  const revokeMut = useRevokeToken();

  const tokens = tokensQuery.data ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [justCreated, setJustCreated] = useState<CreatedApiToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const data = await createMut.mutateAsync(trimmed);
      // Keep the dialog open and reveal the token inside it.
      setJustCreated(data);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create key");
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    // Reset for the next open (after the close animation).
    setTimeout(() => {
      setName("");
      setJustCreated(null);
      setError(null);
    }, 200);
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeMut.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to revoke key");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <PanelHeader
        title="API Keys"
        subtitle="Bearer tokens for the browser API. Send as Authorization: Bearer ob_…"
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus />
            New key
          </Button>
        }
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="sm:max-w-lg">
          {justCreated ? (
            <>
              <DialogHeader>
                <DialogTitle>Key “{justCreated.name}” created</DialogTitle>
                <DialogDescription>
                  Copy it now — it&apos;s shown only once and can&apos;t be
                  recovered.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code className="bg-muted min-w-0 flex-1 truncate rounded border px-3 py-2 font-mono text-xs">
                  {justCreated.token}
                </code>
                <CopyButton value={justCreated.token} label="Copy" />
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Give the key a name so you can recognize it later.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="key-name">Key name</Label>
                <Input
                  id="key-name"
                  autoFocus
                  placeholder="e.g. production-worker"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create();
                  }}
                />
                {error && (
                  <p className="text-destructive flex items-center gap-1.5 text-sm">
                    <AlertTriangle className="size-4 shrink-0" />
                    {error}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={create}
                  disabled={createMut.isPending || !name.trim()}
                >
                  {createMut.isPending && <Loader2 className="animate-spin" />}
                  Create key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {error && !dialogOpen && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {tokensQuery.isLoading ? (
        <LoadingRows />
      ) : tokens.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-border overflow-hidden rounded border">
          {tokens.map((token) => {
            const revoked = token.revokedAt !== null;
            const revoking =
              revokeMut.isPending && revokeMut.variables === token.id;
            return (
              <div
                key={token.id}
                className="bg-card flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
              >
                <KeyRound className="text-muted-foreground size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 truncate text-sm font-medium">
                    {token.name}
                    {revoked && (
                      <Badge variant="secondary" className="font-normal">
                        Revoked
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Created {formatDateTime(token.createdAt)} · Last used{" "}
                    {timeAgo(token.lastUsedAt)}
                  </span>
                </div>
                {!revoked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={revoking}
                    onClick={() => revoke(token.id)}
                  >
                    {revoking ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    Revoke
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded border">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-card flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
        >
          <div className="bg-muted size-4 shrink-0 animate-pulse rounded" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="bg-muted h-3.5 w-32 animate-pulse rounded" />
            <div className="bg-muted h-3 w-48 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded border border-dashed py-12 text-center">
      <KeyRound className="size-6 opacity-50" />
      <p className="text-sm">No API keys yet.</p>
      <p className="text-xs">Create one to call the browser API programmatically.</p>
    </div>
  );
}
