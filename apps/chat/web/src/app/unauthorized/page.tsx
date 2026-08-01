import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@evetools/ui/ui/button";

export default function UnauthorizedPage() {
  return (
    <main className="flex h-dvh items-center justify-center bg-background px-5 text-foreground">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          This Eve instance is restricted to its owner.
        </p>
        <SignOutButton redirectUrl="/login">
          <Button>Sign out</Button>
        </SignOutButton>
      </div>
    </main>
  );
}
