import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ScanLanding from "@/components/ScanLanding";

/**
 * Where every printed QR code points. The token alone identifies the place and
 * is resolved on the server, so a guest can scan a code with their phone's own
 * camera app, outside the application, and still land in the right place.
 *
 * The work itself is kicked off from a Client Component rather than during this
 * render: the scan mutates data and calls `revalidatePath`, which Next refuses
 * to do mid-render. Doing it as a real action also gives the guest honest
 * loading, success and failure states instead of a blank page.
 */
export default async function UnlockPage({ params }: PageProps<"/unlock/[token]">) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/unlock/${token}`)}`);
  }

  return <ScanLanding token={token} />;
}
