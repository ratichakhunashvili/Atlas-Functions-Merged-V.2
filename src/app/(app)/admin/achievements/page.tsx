import Link from "next/link";
import Image from "next/image";
import { deleteAchievement } from "@/actions/achievements";
import { getAllAchievementsWithPlace } from "@/db/queries";
import { PLACE_TYPE_LABELS } from "@/lib/place";
import DeleteButton from "@/components/admin/DeleteButton";
import { Badge, Card } from "@/components/ui";
import { TrophyIcon } from "@/components/icons";

export default async function AdminAchievementsPage() {
  const achievements = await getAllAchievementsWithPlace();

  return (
    <Card
      title="Achievements"
      description="Each one belongs to a single hotel, attraction or partner. Create and edit them on that place's own page."
    >
      {achievements.length === 0 ? (
        <p className="text-sm text-zinc-500">
          None yet. Open a hotel, attraction or partner and use its Achievement panel.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {achievements.map((achievement) => (
            <li key={achievement.id} className="flex items-center gap-3 py-3">
              {achievement.badgeImagePath ? (
                <Image
                  src={achievement.badgeImagePath}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full border-2 border-amber-400 object-cover"
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700">
                  <TrophyIcon className="h-5 w-5 text-zinc-400" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{achievement.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {PLACE_TYPE_LABELS[achievement.placeType]} ·{" "}
                  {achievement.placeName ?? "place no longer exists"}
                </p>
              </div>

              <Badge tone={achievement.holders > 0 ? "green" : "neutral"}>
                {achievement.holders} held
              </Badge>

              {achievement.placeName && (
                <Link
                  href={`/admin/${achievement.placeType}s/${achievement.placeId}`}
                  className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Edit
                </Link>
              )}

              <DeleteButton
                onDelete={async () => {
                  "use server";
                  await deleteAchievement(achievement.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
