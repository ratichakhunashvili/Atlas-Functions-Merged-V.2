import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  deleteHotel,
  regenerateHotelQrToken,
  revokeHotelUnlock,
} from "@/actions/hotels";
import { assignPartnerToHotel, unassignPartnerFromHotel } from "@/actions/partners";
import { deleteHotelActivity } from "@/actions/hotel-activities";
import { deleteHotelEvent } from "@/actions/hotel-events";
import { revokeItinerary } from "@/actions/itinerary";
import {
  getAchievementForPlace,
  getHotelActivities,
  getHotelById,
  getHotelEvents,
  getPartnersWithAssignment,
  getUnlocksForHotel,
} from "@/db/queries";
import HotelForm from "@/components/admin/HotelForm";
import HotelActivityRow from "@/components/admin/HotelActivityRow";
import HotelEventRow from "@/components/admin/HotelEventRow";
import AchievementForm from "@/components/admin/AchievementForm";
import HotelActivityForm from "@/components/admin/HotelActivityForm";
import HotelEventForm from "@/components/admin/HotelEventForm";
import QrCodeCard from "@/components/admin/QrCodeCard";
import DeleteButton from "@/components/admin/DeleteButton";
import PartnerAssignmentToggle from "@/components/admin/PartnerAssignmentToggle";
import { Card } from "@/components/ui";

export default async function AdminHotelPage({ params }: PageProps<"/admin/hotels/[id]">) {
  const { id } = await params;
  const hotel = await getHotelById(id);
  if (!hotel) notFound();

  const [partners, activities, events, unlocks, achievement] = await Promise.all([
    getPartnersWithAssignment(id),
    getHotelActivities(id),
    getHotelEvents(id),
    getUnlocksForHotel(id),
    getAchievementForPlace("hotel", id),
  ]);

  const assignedCount = partners.filter((partner) => partner.assigned).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/hotels" className="text-sm text-indigo-600 hover:underline">
            ← Hotels
          </Link>
          <h1 className="text-2xl font-semibold">{hotel.name}</h1>
        </div>
        <DeleteButton
          size="md"
          label="Delete hotel"
          redirectTo="/admin/hotels"
          onDelete={async () => {
            "use server";
            await deleteHotel(id);
          }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card title="Details">
            <HotelForm hotel={hotel} />
          </Card>

          <Card
            title="Partners for this hotel"
            description={`${assignedCount} assigned. Guests of this hotel see only these — never the full partner list.`}
          >
            {partners.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No partners exist yet.{" "}
                <Link href="/admin/partners" className="text-indigo-600 hover:underline">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {partners.map((partner) => (
                  <li key={partner.id} className="flex items-center gap-3 py-2.5">
                    <Image
                      src={partner.photoPath}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-lg object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{partner.name}</span>
                    <PartnerAssignmentToggle
                      assigned={partner.assigned}
                      onAssign={async () => {
                        "use server";
                        await assignPartnerToHotel(id, partner.id);
                      }}
                      onUnassign={async () => {
                        "use server";
                        await unassignPartnerFromHotel(id, partner.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Hotel activities"
            description="Every generated day includes one of these, as the first or last stop."
          >
            {activities.length === 0 ? (
              <p className="mb-4 text-sm text-amber-600">
                None yet — day plans for this hotel will be entirely outside the hotel
                until you add one.
              </p>
            ) : (
              <ul className="mb-5 divide-y divide-zinc-200 dark:divide-zinc-800">
                {activities.map((activity) => (
                  <HotelActivityRow
                    key={activity.id}
                    activity={{
                      id: activity.id,
                      name: activity.name,
                      kind: activity.kind,
                      description: activity.description,
                      active: activity.active,
                    }}
                    onDelete={async () => {
                      "use server";
                      await deleteHotelActivity(activity.id);
                    }}
                  />
                ))}
              </ul>
            )}
            <HotelActivityForm hotelId={id} />
          </Card>

          <Card title="Hotel events" description="Shown to guests under “What's on”.">
            {events.length > 0 && (
              <ul className="mb-5 divide-y divide-zinc-200 dark:divide-zinc-800">
                {events.map((event) => (
                  <HotelEventRow
                    key={event.id}
                    event={{
                      id: event.id,
                      title: event.title,
                      description: event.description,
                      startsAt: event.startsAt.toISOString(),
                      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
                      past: event.past,
                    }}
                    onDelete={async () => {
                      "use server";
                      await deleteHotelEvent(event.id);
                    }}
                  />
                ))}
              </ul>
            )}
            <HotelEventForm hotelId={id} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Hotel QR code" description="Print this for the front desk.">
            <QrCodeCard
              title={hotel.name}
              qrSrc={`/api/hotels/${id}/qr`}
              token={hotel.qrToken}
              onRegenerate={async () => {
                "use server";
                await regenerateHotelQrToken(id);
              }}
            />
          </Card>

          <Card title="Achievement">
            <AchievementForm
              placeType="hotel"
              placeId={id}
              placeName={hotel.name}
              existing={achievement}
            />
          </Card>

          <Card title="Guests" description="Who has unlocked this hotel.">
            {unlocks.length === 0 ? (
              <p className="text-sm text-zinc-500">Nobody yet.</p>
            ) : (
              <ul className="space-y-2">
                {unlocks.map((unlock) => (
                  <li key={unlock.userId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm">{unlock.username}</span>
                    <span className="flex shrink-0 gap-1.5">
                      <DeleteButton
                        label="Reset plan"
                        confirmLabel="Confirm reset"
                        onDelete={async () => {
                          "use server";
                          await revokeItinerary(unlock.userId, id);
                        }}
                      />
                      <DeleteButton
                        label="Revoke"
                        confirmLabel="Confirm"
                        onDelete={async () => {
                          "use server";
                          await revokeHotelUnlock(id, unlock.userId);
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
