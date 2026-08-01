import { auth } from "@clerk/nextjs/server";

export async function authorizeOwner(): Promise<Response | null> {
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
