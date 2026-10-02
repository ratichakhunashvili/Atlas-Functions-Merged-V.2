import Link from "next/link";
import Image from "next/image";
import { deletePartner } from "@/actions/partners";
import { getAllHotels, getAllPartners, getPartnersForHotel } from "@/db/queries";
import { CATEGORY_LABELS } from "@/lib/partner-category";
import PartnerForm from "@/components/admin/PartnerForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { Badge, Card } from "@/components/ui";

export default async function AdminPartnersPage() {
  const [partners, hotels] = await Promise.all([getAllPartners(), getAllHotels()]);

  // Counting assignments here makes the "partners are per-hotel" rule visible
  // at a glance — an unassigned partner is invisible to every guest.
  const assignments = await Promise.all(
    hotels.map(async (hotel) => ({
      hotelId: hotel.id,
      partnerIds: new Set((await getPartnersForHotel(hotel.id)).map((p) => p.id)),
    })),
  );
  const assignedHotelCount = (partnerId: string) =>
    assignments.filter((entry) => entry.partnerIds.has(partnerId)).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
      <Card
        title="Partners"
        description="Businesses shown only to the hotels they're assigned to."
      >
        {partners.length === 0 ? (
          <p className="text-sm text-zinc-500">No partners yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {partners.map((partner) => {
              const count = assignedHotelCount(partner.id);
              return (
                <li key={partner.id} className="flex items-center gap-3 py-3">
                  <Image
                    src={partner.photoPath}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/partners/${partner.id}`}
                      className="font-medium hover:underline"
                    >
                      {partner.name}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {CATEGORY_LABELS[partner.category]} ·{" "}
                      {partner.verificationMode.toUpperCase()} check-in
                    </p>
                  </div>
                  {partner.modelPath && <Badge tone="indigo">3D</Badge>}
                  <Badge tone={count === 0 ? "amber" : "green"}>
                    {count === 0 ? "No hotel" : `${count} hotel${count === 1 ? "" : "s"}`}
                  </Badge>
                  <DeleteButton
                    onDelete={async () => {
                      "use server";
                      await deletePartner(partner.id);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Add a partner">
        <PartnerForm />
      </Card>
    </div>
  );
}
