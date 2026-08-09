import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/** Root just routes you onward: your portal if signed in, otherwise login. */
export default async function Home() {
  const session = await getSession();
  redirect(session ? `/${session.slug}` : "/login");
}
