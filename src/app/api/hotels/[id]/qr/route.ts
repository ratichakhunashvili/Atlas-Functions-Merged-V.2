import QRCode from "qrcode";
import { auth } from "@/auth";
import { getHotelById } from "@/db/queries";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/hotels/[id]/qr">,
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const hotel = await getHotelById(id);
  if (!hotel) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(`/unlock/${hotel.qrToken}`, new URL(request.url).origin);
  const png = await QRCode.toBuffer(url.toString(), {
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
