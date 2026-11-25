import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// RETIRED: the question admin moved to the main admin dashboard (admin login required).
export default function RetiredAdminPage() {
  redirect("https://syntaacademy.tn/admin/login.html");
}
