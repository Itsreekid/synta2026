import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// RETIRED: the placement test moved to the main Synta site.
export default function RetiredPage() {
  redirect(process.env.MAIN_SITE_URL || "https://syntaacademy.tn/session");
}
