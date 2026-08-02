import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { verifyDesktopSession } from "@/lib/desktop-session";

export async function authorizeOwner(): Promise<Response | null> {
  if (process.env.EVEDRAW_DESKTOP === "1") {
    const token = (await cookies()).get("eve_desktop_session")?.value;
    const secret = process.env.CLERK_SECRET_KEY;
    const owner = process.env.EVE_OWNER_USER_ID;
    const verified = token && secret ? await verifyDesktopSession(token, secret) : undefined;
    if (verified?.userId === owner) return null;
  }
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const ownerUserId = process.env.EVE_OWNER_USER_ID;
  if (!ownerUserId || userId !== ownerUserId) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  return null;
}
