import { Brand } from "@/components/brand";

/**
 * Split auth layout: banner panel on the left (desktop only), form on the right.
 */
export function AuthShell({
  banner,
  children,
}: {
  banner: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="hidden lg:block">{banner}</div>
      <div className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
