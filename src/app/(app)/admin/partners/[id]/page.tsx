import { notFound } from "next/navigation";
import Link from "next/link";
import {
  assignPartnerToHotel,
  deletePartner,
  regeneratePartnerQrToken,
  unassignPartnerFromHotel,
} from "@/actions/partners";
import {
  getAchievementForPlace,
  getAllHotels,
  getHotelsForPartner,
  getPartnerById,
} from "@/db/queries";
import PartnerForm from "@/components/admin/PartnerForm";
import AchievementForm from "@/components/admin/AchievementForm";
import QrCodeCard from "@/components/admin/QrCodeCard";
import DeleteButton from "@/components/admin/DeleteButton";
import PartnerAssignmentToggle from "@/components/admin/PartnerAssignmentToggle";
import { Alert, Card } from "@/components/ui";

export default async function AdminPartnerPage({ params }: PageProps<"/admin/partners/[id]">) {
  const { id } = await params;
  const partner = await getPartnerById(id);
  if (!partner) notFound();

  const [achievement, hotels, assignedHotels] = await Promise.all([
    getAchievementForPlace("partner", id),
    getAllHotels(),
    getHotelsForPartner(id),
  ]);
  const assignedIds = new Set(assignedHotels.map((hotel) => hotel.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/partners" className="text-sm text-indigo-600 hover:underline">
            ← Partners
          </Link>
          <h1 className="text-2xl font-semibold">{partner.name}</h1>
        </div>
        <DeleteButton
          size="md"
          label="Delete partner"
          redirectTo="/admin/partners"
          onDelete={async () => {
            "use server";
            await deletePartner(id);
          }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title="Details">
          <PartnerForm partner={partner} />
        </Card>

        <div className="space-y-5">
          <Card
            title="Which hotels see this partner"
            description="Guests of any other hotel never see it."
          >
            {assignedIds.size === 0 && (
              <Alert kind="warning">
                Not assigned to any hotel yet, so no guest can see it.
              </Alert>
            )}
            <ul className="mt-3 space-y-2">
              {hotels.map((hotel) => (
                <li key={hotel.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">{hotel.name}</span>
                  <PartnerAssignmentToggle
                    assigned={assignedIds.has(hotel.id)}
                    onAssign={async () => {
                      "use server";
                      await assignPartnerToHotel(hotel.id, id);
                    }}
                    onUnassign={async () => {
                      "use server";
                      await unassignPartnerFromHotel(hotel.id, id);
                    }}
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card title="QR code">
            <QrCodeCard
              title={partner.name}
              qrSrc={`/api/partners/${id}/qr`}
              token={partner.qrToken}
              onRegenerate={async () => {
                "use server";
                await regeneratePartnerQrToken(id);
              }}
            />
          </Card>

          <Card title="Achievement">
            <AchievementForm
              placeType="partner"
              placeId={id}
              placeName={partner.name}
              existing={achievement}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
