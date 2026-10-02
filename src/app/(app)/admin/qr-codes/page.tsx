import {
  regenerateAttractionQrToken,
} from "@/actions/attractions";
import { regenerateHotelQrToken } from "@/actions/hotels";
import { regeneratePartnerQrToken } from "@/actions/partners";
import { getAllAttractions, getAllHotels, getAllPartners } from "@/db/queries";
import QrCodeCard from "@/components/admin/QrCodeCard";
import type { VerificationMode } from "@/lib/place";
import { Badge, Card } from "@/components/ui";

export default async function AdminQrCodesPage() {
  const [hotels, attractions, partners] = await Promise.all([
    getAllHotels(),
    getAllAttractions(),
    getAllPartners(),
  ]);

  return (
    <div className="space-y-5">
      <Card
        title="Hotel QR codes"
        description="Display these at the front desk — scanning one identifies the hotel and unlocks it for the guest."
      >
        <QrGrid
          items={hotels.map((hotel) => ({
            id: hotel.id,
            name: hotel.name,
            token: hotel.qrToken,
            src: `/api/hotels/${hotel.id}/qr`,
          }))}
          onRegenerate={async (id) => {
            "use server";
            await regenerateHotelQrToken(id);
          }}
        />
      </Card>

      <Card
        title="Attraction QR codes"
        description="Every attraction has a code, but only the ones marked “QR check-in” need it printed and placed on site."
      >
        <QrGrid
          items={attractions.map((attraction) => ({
            id: attraction.id,
            name: attraction.name,
            token: attraction.qrToken,
            src: `/api/attractions/${attraction.id}/qr`,
            verificationMode: attraction.verificationMode,
          }))}
          onRegenerate={async (id) => {
            "use server";
            await regenerateAttractionQrToken(id);
          }}
        />
      </Card>

      <Card
        title="Partner QR codes"
        description="Give these to partner businesses to display."
      >
        <QrGrid
          items={partners.map((partner) => ({
            id: partner.id,
            name: partner.name,
            token: partner.qrToken,
            src: `/api/partners/${partner.id}/qr`,
            verificationMode: partner.verificationMode,
          }))}
          onRegenerate={async (id) => {
            "use server";
            await regeneratePartnerQrToken(id);
          }}
        />
      </Card>
    </div>
  );
}

function QrGrid({
  items,
  onRegenerate,
}: {
  items: {
    id: string;
    name: string;
    token: string;
    src: string;
    verificationMode?: VerificationMode;
  }[];
  onRegenerate: (id: string) => Promise<void>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Nothing here yet.</p>;
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{item.name}</p>
            {/* Tells the admin at a glance whether this code is actually used. */}
            {item.verificationMode && (
              <Badge tone={item.verificationMode === "qr" ? "green" : "neutral"}>
                {item.verificationMode === "qr"
                  ? "QR check-in"
                  : `${item.verificationMode.toUpperCase()} check-in`}
              </Badge>
            )}
          </div>
          <QrCodeCard
            title={item.name}
            qrSrc={item.src}
            token={item.token}
            onRegenerate={async () => {
              "use server";
              await onRegenerate(item.id);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
