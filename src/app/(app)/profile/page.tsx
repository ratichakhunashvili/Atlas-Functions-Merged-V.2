import Link from "next/link";
import { auth } from "@/auth";
import {
  getAchievementCollection,
  getActiveHotelForUser,
  getPlaceCheckInsForUser,
  getUserPreferences,
} from "@/db/queries";
import { testToolsEnabled } from "@/lib/dev-tools";
import { PLACE_TYPE_LABELS } from "@/lib/place";
import PreferencesForm from "@/components/PreferencesForm";
import AchievementCollection, {
  type CollectionItem,
} from "@/components/AchievementCollection";
import TestToolsPanel from "@/components/TestToolsPanel";
import { Card } from "@/components/ui";

export default async function ProfilePage() {
  const session = await auth();
  const userId = session!.user.id;

  const [preferences, collection, checkIns, activeHotel] = await Promise.all([
    getUserPreferences(userId),
    getAchievementCollection(userId),
    getPlaceCheckInsForUser(userId),
    getActiveHotelForUser(userId),
  ]);

  // Dates don't cross the server/client boundary cleanly inside a plain object
  // prop, so they're serialized here and re-parsed in the component.
  const items: CollectionItem[] = collection.map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    badgeImagePath: achievement.badgeImagePath,
    placeType: achievement.placeType,
    placeName: achievement.placeName,
    unlockedAt: achievement.unlockedAt ? achievement.unlockedAt.toISOString() : null,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">{session!.user.username}</h1>
        <p className="text-sm text-zinc-500">
          {activeHotel ? (
            <>
              Staying at{" "}
              <Link href={`/hotels/${activeHotel.id}`} className="underline">
                {activeHotel.name}
              </Link>
            </>
          ) : (
            "Scan a hotel QR code to begin."
          )}
        </p>
      </header>

      <Card
        title="Achievements"
        description="Every badge you've collected from hotels, attractions and partners."
      >
        <AchievementCollection items={items} />
      </Card>

      <Card title="Places visited" description="Each place counts once, however often you return.">
        {checkIns.length === 0 ? (
          <p className="text-sm text-zinc-500">No check-ins yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {checkIns.slice(0, 10).map((checkIn) => (
              <li
                key={`${checkIn.placeType}-${checkIn.placeId}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-zinc-600 dark:text-zinc-300"
              >
                <span className="min-w-0 truncate font-medium">
                  {checkIn.placeName ?? "A place that has since been removed"}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {PLACE_TYPE_LABELS[checkIn.placeType]} ·{" "}
                  {checkIn.verificationMode.toUpperCase()} ·{" "}
                  {checkIn.lastCheckedInAt.toLocaleDateString()}
                  {checkIn.checkInCount > 1 ? ` · ${checkIn.checkInCount} visits` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Your interests"
        description="Day plans only draw from the categories you pick here."
      >
        <PreferencesForm initialSelected={preferences} />
      </Card>

      {testToolsEnabled() && (
        <TestToolsPanel
          hotelId={activeHotel?.id ?? null}
          achievements={collection.map((achievement) => ({
            id: achievement.id,
            name: achievement.name,
            held: achievement.unlockedAt !== null,
          }))}
        />
      )}
    </div>
  );
}
