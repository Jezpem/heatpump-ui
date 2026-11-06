import { redirect } from "next/navigation";

// The heat pump page now lives on the dashboard. Kept as a redirect so bookmarks
// and older links land on the merged page rather than a 404.
export default function HeatPumpPage() {
  redirect("/");
}
