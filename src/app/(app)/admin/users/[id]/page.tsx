import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getAchievementCollection,
  getAllHotels,
  getItineraryDaysForUser,
  getPlaceCheckInsForUser,
  getUserById,
} from "@/db/queries";
import { PLACE_TYPE_LABELS } from "@/lib/place";
import { Badge, Card } from "@/components/ui";

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const user = await getUserById(id);
  if (!user) notFound();

  const [collection, checkIns, hotels] = await Promise.all([
    getAchievementCollection(id),
    getPlaceCheckInsForUser(id),
    getAllHotels(),
  ]);

  const unlocked = collection.filter((achievement) => achievement.unlockedAt !== null);
  const days = (
    await Promise.all(hotels.map((hotel) => getItineraryDaysForUser(id, hotel.id)))
  ).flat();
  const hotelNames = new Map(hotels.map((hotel) => [hotel.id, hotel.name]));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/users" className="text-sm text-indigo-600 hover:underline">
          ← Users
        </Link>
        <h1 className="text-2xl font-semibold">{user.username}</h1>
        <p className="text-sm text-zinc-500">
          {user.role} · joined {user.createdAt.toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Achievements (${unlocked.length})`}>
          {unlocked.length === 0 ? (
            <p className="text-sm text-zinc-500">None unlocked yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {unlocked.map((achievement) => (
                <li key={achievement.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {achievement.name}
                    <span className="ml-2 text-xs text-zinc-400">
                      {PLACE_TYPE_LABELS[achievement.placeType]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {achievement.unlockedAt?.toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Check-ins (${checkIns.length})`}>
          {checkIns.length === 0 ? (
            <p className="text-sm text-zinc-500">No check-ins yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {checkIns.map((checkIn) => (
                <li
                  key={`${checkIn.placeType}-${checkIn.placeId}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="capitalize">{checkIn.placeType}</span>
                  <span className="text-xs text-zinc-500">
                    {checkIn.verificationMode.toUpperCase()} · ×{checkIn.checkInCount} ·{" "}
                    {checkIn.lastCheckedInAt.toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Itinerary history">
        {days.length === 0 ? (
          <p className="text-sm text-zinc-500">No day plans generated.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {days.map((day) => (
              <li key={day.id} className="flex items-center justify-between gap-3">
                <span>
                  {hotelNames.get(day.hotelId) ?? "Unknown hotel"} · Day {day.dayNumber}
                </span>
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {day.stopCount} stops · {day.generatedAt.toLocaleDateString()}
                  {day.completedAt ? <Badge tone="green">Completed</Badge> : <Badge>In progress</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
