import { redirect } from "next/navigation";

export default function RootRedirect() {
  redirect("/sign-in");
}
