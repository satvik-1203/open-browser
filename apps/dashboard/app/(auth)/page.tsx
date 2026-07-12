import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;re signed in — this page is gated by the{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">(auth)</code>{" "}
          layout.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Add more components with{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              pnpm dlx shadcn@latest add &lt;component&gt;
            </code>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
        </CardContent>
      </Card>
    </main>
  );
}
