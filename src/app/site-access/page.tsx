import { redirect } from "next/navigation";
import { siteAccessRequired } from "@/lib/site-access";
import SiteAccessForm from "@/components/SiteAccessForm";

/**
 * The password wall shown in front of the whole app when `SITE_ACCESS_PASSWORD`
 * is set. See `lib/site-access.ts` for why this exists.
 */
export default async function SiteAccessPage({
  searchParams,
}: PageProps<"/site-access">) {
  // Nothing to gate on an ordinary deployment or in local development —
  // send a direct visit here straight through instead of showing a form for a
  // password that was never configured.
  if (!siteAccessRequired()) redirect("/");

  const { callbackUrl } = await searchParams;
  const target = typeof callbackUrl === "string" ? callbackUrl : "/";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <SiteAccessForm callbackUrl={target} />
    </div>
  );
}
