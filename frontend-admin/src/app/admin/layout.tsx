import "../globals.css";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/adminDb";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdminUser();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not authenticated")) {
      redirect("/sign-in?redirect=/admin");
    }
    redirect("/sign-in?redirect=/admin&error=invalid_role");
  }
  return children;
}
