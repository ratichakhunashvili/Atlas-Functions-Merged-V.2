import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { getHotelsWithUnlockStatus } from "@/db/queries";

export default async function GalleryPage({
  searchParams,
}: PageProps<"/gallery">) {
  const session = await auth();
  const hotels = await getHotelsWithUnlockStatus(session!.user.id);
  const { unlockError, locked } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Hotels</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Scan a hotel&apos;s QR code at the front desk to unlock its map of
        nearby attractions and partners.
      </p>

      {typeof unlockError === "string" && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {unlockError}
        </p>
      )}
      {typeof locked === "string" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Scan that hotel&apos;s QR code first to unlock its map.
        </p>
      )}

      {hotels.length === 0 ? (
        <p className="text-zinc-500">No hotels have been added yet. Check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => {
            const card = (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="relative h-36 w-full">
                  <Image
                    src={hotel.photoPath}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className={`object-cover ${hotel.unlocked ? "" : "blur-sm grayscale"}`}
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-medium">{hotel.name}</h2>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        hotel.unlocked
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {hotel.unlocked ? "Unlocked" : "Locked"}
                    </span>
                  </div>
                  {hotel.unlocked && hotel.address && (
                    <p className="mt-1 text-sm text-zinc-500">{hotel.address}</p>
                  )}
                </div>
              </div>
            );

            return hotel.unlocked ? (
              <Link key={hotel.id} href={`/hotels/${hotel.id}`}>
                {card}
              </Link>
            ) : (
              <div key={hotel.id}>{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
