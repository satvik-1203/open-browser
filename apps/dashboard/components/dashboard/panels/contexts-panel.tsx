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
import {
  AlertTriangle,
  Fingerprint,
  Loader2,
  Plus,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";

import { CopyButton } from "../copy-button";
import { timeAgo } from "../format";
import { PanelHeader } from "../panel-header";
import {
  useContextsQuery,
  useCreateContext,
  useDeleteContext,
} from "@/lib/dashboard/queries";
import type { BrowserContextRecord } from "@/lib/dashboard/types";

/** Human-readable snapshot size; "—" before the first save. */
function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ context }: { context: BrowserContextRecord }) {
  // Live writers outrank the stored status: it's the state that explains why
  // the version may be about to move, and why delete is unavailable.
  if (context.writers > 0) {
    return (
      <Badge variant="secondary" className="font-normal">
        {context.writers} writing
      </Badge>
    );
  }
  if (context.status === "saving") {
    return (
      <Badge variant="secondary" className="font-normal">
        Saving
      </Badge>
    );
  }
  if (context.status === "failed") {
    return (
      <Badge variant="destructive" className="font-normal">
        Save failed
      </Badge>
    );
  }
  // Version 0 means the context exists but nothing has been captured into it
  // yet — worth calling out, since loading it gives a clean browser.
  if (context.version === 0) {
    return (
      <Badge variant="outline" className="font-normal">
        Empty
      </Badge>
    );
  }
  return null;
}

export function ContextsPanel() {
  const contextsQuery = useContextsQuery();
  const createMut = useCreateContext();
  const deleteMut = useDeleteContext();

  const contexts = contextsQuery.data ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      await createMut.mutateAsync({ name: name.trim() || undefined });
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create context");
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setTimeout(() => {
      setName("");
      setError(null);
    }, 200);
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMut.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete context");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <PanelHeader
        title="Contexts"
        subtitle="Saved cookies and localStorage. Start a browser with a contextId to reuse a login."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus />
            New context
          </Button>
        }
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create context</DialogTitle>
            <DialogDescription>
              Starts empty. Run one browser with this context and{" "}
              <code className="font-mono text-xs">persistContext: true</code>,
              log in there, and every later session that uses it starts signed
              in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="context-name">Name</Label>
            <Input
              id="context-name"
              autoFocus
              placeholder="e.g. gmail-support-account"
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
            <Button onClick={create} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="animate-spin" />}
              Create context
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && !dialogOpen && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {contextsQuery.isLoading ? (
        <LoadingRows />
      ) : contexts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-border overflow-hidden rounded border">
          {contexts.map((context) => {
            const deleting =
              deleteMut.isPending && deleteMut.variables === context.id;
            return (
              <div
                key={context.id}
                className="bg-card flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
              >
                <UserRoundCheck className="text-muted-foreground size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 truncate text-sm font-medium">
                    {context.name ?? "Untitled context"}
                    <StatusBadge context={context} />
                    {context.fingerprint && (
                      <Fingerprint
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-label="Pinned fingerprint"
                      />
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    v{context.version} · {formatSize(context.sizeBytes)} · Last
                    used {timeAgo(context.lastUsedAt)}
                  </span>
                  {context.status === "failed" && context.errorMessage && (
                    // The context still loads its previous version, so say so —
                    // otherwise "Save failed" reads as "profile is broken".
                    <span className="text-destructive mt-0.5 text-xs">
                      {context.errorMessage} · still loading v{context.version}
                    </span>
                  )}
                </div>
                <code className="text-muted-foreground hidden font-mono text-xs sm:block">
                  {context.id.slice(0, 8)}
                </code>
                <CopyButton value={context.id} label="Copy ID" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  // A context with live writers can't be deleted; they'd commit
                  // on top of a row that no longer exists.
                  disabled={deleting || context.writers > 0}
                  title={
                    context.writers > 0
                      ? `${context.writers} running session(s) still writing`
                      : undefined
                  }
                  onClick={() => remove(context.id)}
                >
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete
                </Button>
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
            <div className="bg-muted h-3.5 w-40 animate-pulse rounded" />
            <div className="bg-muted h-3 w-56 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded border border-dashed py-12 text-center">
      <UserRoundCheck className="size-6 opacity-50" />
      <p className="text-sm">No contexts yet.</p>
      <p className="text-xs">
        Create one to keep a login alive across browser sessions.
      </p>
    </div>
  );
}
