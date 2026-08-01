import { LoginView } from "../login-view";

export default function LoginPage() {
  const redirectUrl =
    process.env.EVEDRAW_DESKTOP === "1"
      ? "http://127.0.0.1:43117/desktop-auth/callback"
      : "/";

  return <LoginView redirectUrl={redirectUrl} />;
}
