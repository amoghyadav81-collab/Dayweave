import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/security.mjs";
export async function requireChatGPTUser(returnTo: string) {
  const user = sessionUser(await headers());
  if (!user) redirect("/login?return_to=" + encodeURIComponent(returnTo));
  return { userId: String(user.id), displayName: String(user.email) };
}
