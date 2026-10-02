import QRCode from "qrcode";
import { auth } from "@/auth";
import { getPartnerById } from "@/db/queries";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/partners/[id]/qr">,
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const partner = await getPartnerById(id);
  if (!partner) {
    return new Response("Not found", { status: 404 });
  }

  // Scanned in-app during check-in (not opened as a link), so it just encodes the raw token.
  const png = await QRCode.toBuffer(partner.qrToken, {
    width: 512,
    margin: 2,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
