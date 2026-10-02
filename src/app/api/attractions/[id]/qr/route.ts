import QRCode from "qrcode";
import { auth } from "@/auth";
import { getAttractionById } from "@/db/queries";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/attractions/[id]/qr">,
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const attraction = await getAttractionById(id);
  if (!attraction) {
    return new Response("Not found", { status: 404 });
  }

  // Scanned in-app during the "AR" check-in flow (not opened as a link), so it just encodes the raw token.
  const png = await QRCode.toBuffer(attraction.qrToken, {
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
