import Link from "next/link";
import Image from "next/image";
import { deleteHotel } from "@/actions/hotels";
import { getAllHotels, getHotelUnlockCounts } from "@/db/queries";
import HotelForm from "@/components/admin/HotelForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { Badge, Card } from "@/components/ui";

export default async function AdminHotelsPage() {
  const [hotels, unlockCounts] = await Promise.all([
    getAllHotels(),
    getHotelUnlockCounts(),
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
      <Card title="Hotels" description="Each hotel has its own QR code, partners and guests.">
        {hotels.length === 0 ? (
          <p className="text-sm text-zinc-500">No hotels yet — add one on the right.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {hotels.map((hotel) => (
              <li key={hotel.id} className="flex items-center gap-3 py-3">
                <Image
                  src={hotel.photoPath}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/hotels/${hotel.id}`}
                    className="font-medium hover:underline"
                  >
                    {hotel.name}
                  </Link>
                  <p className="truncate text-xs text-zinc-500">
                    {hotel.address ?? "No address"} ·{" "}
                    {unlockCounts[hotel.id] ?? 0} guest
                    {(unlockCounts[hotel.id] ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                {hotel.modelPath && <Badge tone="indigo">3D</Badge>}
                {hotel.latitude == null && <Badge tone="amber">No location</Badge>}
                <DeleteButton
                  onDelete={async () => {
                    "use server";
                    await deleteHotel(hotel.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Add a hotel">
        <HotelForm />
      </Card>
    </div>
  );
}
