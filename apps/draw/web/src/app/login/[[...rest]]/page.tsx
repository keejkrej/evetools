import { LoginView } from "../login-view";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ desktop?: string; state?: string }> }) {
  const query = await searchParams;
  const externalDesktopLogin = query.desktop === "1" && Boolean(query.state);
  const redirectUrl = externalDesktopLogin
    ? `/desktop-auth/callback?state=${encodeURIComponent(query.state!)}`
    : "/";
  return <LoginView desktopShell={process.env.EVEDRAW_DESKTOP === "1" && !externalDesktopLogin} redirectUrl={redirectUrl} />;
}
