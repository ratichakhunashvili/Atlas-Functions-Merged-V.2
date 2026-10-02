import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import {
  getActiveHotelActivities,
  getAchievementForPlace,
  getAllAttractions,
  getHotelById,
  getLatestItineraryDay,
  getPartnersForHotel,
  getUnlockedPlaceKeys,
  getUpcomingHotelEvents,
  isHotelUnlockedForUser,
} from "@/db/queries";
import { DEFAULT_MAP_CENTER } from "@/lib/mapbox";
import { getWalkingRoute, type RouteLineString } from "@/lib/route-engine";
import { placeKey } from "@/lib/place";
import { testToolsEnabled } from "@/lib/dev-tools";
import HotelMap, { type MapPlace, type MapRoute } from "@/components/HotelMap";
import ItineraryPanel, { type PanelStop } from "@/components/ItineraryPanel";
import TestToolsPanel from "@/components/TestToolsPanel";
import { Alert, Card } from "@/components/ui";
import { CalendarIcon } from "@/components/icons";

function toPoint(value: { latitude: number; longitude: number }) {
  return { lat: value.latitude, lng: value.longitude };
}

export default async function HotelPage({
  params,
  searchParams,
}: PageProps<"/hotels/[id]">) {
  const { id } = await params;
  const { scan, scanError } = await searchParams;
  const session = await auth();
  const hotel = await getHotelById(id);
  if (!hotel) notFound();

  const isAdmin = session!.user.role === "admin";
  const unlocked = isAdmin || (await isHotelUnlockedForUser(session!.user.id, id));
  if (!unlocked) redirect(`/gallery?locked=${id}`);

  const [attractions, partners, activities, events, itineraryDay, unlockedKeys, hotelAchievement] =
    await Promise.all([
      getAllAttractions(),
      // Hotel separation: only this hotel's assigned partners, never the global list.
      getPartnersForHotel(id),
      getActiveHotelActivities(id),
      getUpcomingHotelEvents(id),
      getLatestItineraryDay(session!.user.id, id),
      getUnlockedPlaceKeys(session!.user.id),
      getAchievementForPlace("hotel", id),
    ]);

  const center = {
    lat: hotel.latitude ?? DEFAULT_MAP_CENTER.lat,
    lng: hotel.longitude ?? DEFAULT_MAP_CENTER.lng,
  };

  const [attractionAchievements, partnerAchievements] = await Promise.all([
    Promise.all(attractions.map((a) => getAchievementForPlace("attraction", a.id))),
    Promise.all(partners.map((p) => getAchievementForPlace("partner", p.id))),
  ]);

  const places: MapPlace[] = [
    {
      id: hotel.id,
      placeType: "hotel",
      name: hotel.name,
      description: hotel.description,
      category: null,
      photoPath: hotel.photoPath,
      latitude: center.lat,
      longitude: center.lng,
      address: hotel.address,
      modelPath: hotel.modelPath,
      model3dEnabled: hotel.model3dEnabled,
      modelTargetHeightMeters: hotel.modelTargetHeightMeters,
      modelRotationDeg: hotel.modelRotationDeg,
      modelElevationOffsetMeters: hotel.modelElevationOffsetMeters,
      modelScaleMultiplier: hotel.modelScaleMultiplier,
      achievementName: hotelAchievement?.name ?? null,
    },
    ...attractions
      .filter((a) => a.latitude != null && a.longitude != null)
      .map((a, index) => ({
        id: a.id,
        placeType: "attraction" as const,
        name: a.name,
        description: a.description,
        category: a.category,
        photoPath: a.photoPath,
        latitude: a.latitude!,
        longitude: a.longitude!,
        modelPath: a.modelPath,
        model3dEnabled: a.model3dEnabled,
        modelTargetHeightMeters: a.modelTargetHeightMeters,
        modelRotationDeg: a.modelRotationDeg,
        modelElevationOffsetMeters: a.modelElevationOffsetMeters,
        modelScaleMultiplier: a.modelScaleMultiplier,
        achievementName: attractionAchievements[index]?.name ?? null,
      })),
    ...partners
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p, index) => ({
        id: p.id,
        placeType: "partner" as const,
        name: p.name,
        description: p.description,
        category: p.category,
        photoPath: p.photoPath,
        latitude: p.latitude!,
        longitude: p.longitude!,
        address: p.address,
        contactPhone: p.contactPhone,
        contactWebsite: p.contactWebsite,
        modelPath: p.modelPath,
        model3dEnabled: p.model3dEnabled,
        modelTargetHeightMeters: p.modelTargetHeightMeters,
        modelRotationDeg: p.modelRotationDeg,
        modelElevationOffsetMeters: p.modelElevationOffsetMeters,
        modelScaleMultiplier: p.modelScaleMultiplier,
        achievementName: partnerAchievements[index]?.name ?? null,
      })),
  ];

  // ---- progressive reveal -------------------------------------------------
  // Everything below slices the day *on the server*. The stops the guest has
  // not reached yet never reach the browser, so the full route can't be read
  // out of the page source.
  let mapRoute: MapRoute | null = null;
  let panelStops: PanelStop[] = [];
  let hiddenCount = 0;
  let currentPlaceKey: string | null = null;

  if (itineraryDay) {
    const currentIndex = itineraryDay.stops.findIndex((stop) => stop.visitedAt === null);
    const isComplete = currentIndex === -1;
    const revealedCount = isComplete ? itineraryDay.stops.length : currentIndex + 1;
    const revealed = itineraryDay.stops.slice(0, revealedCount);
    hiddenCount = itineraryDay.stops.length - revealedCount;

    // Only the leg being walked right now is routed.
    let legGeoJson: RouteLineString | null = null;
    let legError: string | null = null;
    let destinationName: string | null = null;

    if (isComplete) {
      // Day finished: the last leg is the walk back to the hotel.
      const last = itineraryDay.stops[itineraryDay.stops.length - 1];
      if (last) {
        const result = await getWalkingRoute(toPoint(last), center);
        if (result.ok) legGeoJson = result.route.geometry;
        else legError = `${result.error} Pull to refresh to try again.`;
        destinationName = hotel.name;
      }
    } else {
      const origin = currentIndex === 0 ? center : toPoint(itineraryDay.stops[currentIndex - 1]);
      const target = itineraryDay.stops[currentIndex];
      const result = await getWalkingRoute(origin, toPoint(target));
      if (result.ok) legGeoJson = result.route.geometry;
      else legError = `${result.error} Pull to refresh to try again.`;
      destinationName = target.name;

      if (target.sourceId) {
        currentPlaceKey =
          target.stopType === "attraction"
            ? placeKey("attraction", target.sourceId)
            : target.stopType === "partner"
              ? placeKey("partner", target.sourceId)
              : placeKey("hotel", hotel.id);
      } else {
        currentPlaceKey = placeKey("hotel", hotel.id);
      }
    }

    mapRoute = {
      legGeoJson,
      legError,
      destinationName,
      stops: revealed.map((stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        position: stop.position,
        visitedAt: stop.visitedAt,
        sourceId: stop.sourceId,
        stopType: stop.stopType,
      })),
    };

    // AR stops need their reference image in the browser to guide the framing.
    const arTargets = new Map<string, string | null>();
    for (const stop of revealed) {
      if (stop.verificationMode !== "ar" || !stop.sourceId) continue;
      const source =
        stop.stopType === "attraction"
          ? attractions.find((a) => a.id === stop.sourceId)
          : partners.find((p) => p.id === stop.sourceId);
      arTargets.set(stop.id, source?.arTargetPath ?? null);
    }

    panelStops = revealed.map((stop) => ({
      id: stop.id,
      name: stop.name,
      stopType: stop.stopType,
      photoPath: stop.photoPath,
      verificationMode: stop.verificationMode,
      arTargetPath: arTargets.get(stop.id) ?? null,
      visitedAt: stop.visitedAt,
      position: stop.position,
    }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">{hotel.name}</h1>
        {hotel.address && <p className="text-sm text-zinc-500">{hotel.address}</p>}
      </header>

      {typeof scan === "string" && <Alert kind="success">{scan}</Alert>}
      {typeof scanError === "string" && <Alert kind="error">{scanError}</Alert>}

      <HotelMap
        center={center}
        hotelName={hotel.name}
        places={places}
        route={mapRoute}
        unlockedKeys={[...unlockedKeys]}
        currentPlaceKey={currentPlaceKey}
      />

      {mapRoute?.destinationName && (
        <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
          Walking to <span className="font-semibold">{mapRoute.destinationName}</span>
        </p>
      )}

      <ItineraryPanel
        hotelId={id}
        day={
          itineraryDay
            ? {
                dayNumber: itineraryDay.dayNumber,
                stops: panelStops,
                totalDurationSeconds: itineraryDay.totalDurationSeconds,
                completedAt: itineraryDay.completedAt,
              }
            : null
        }
        hiddenCount={hiddenCount}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Card title="Inside the hotel" description="Spa, pool, dining and more.">
          {activities.length === 0 ? (
            <p className="text-sm text-zinc-500">No hotel activities listed yet.</p>
          ) : (
            <ul className="space-y-2">
              {activities.map((activity) => (
                <li key={activity.id} className="flex items-center gap-3">
                  {activity.photoPath ? (
                    <Image
                      src={activity.photoPath}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-xs dark:bg-zinc-800">
                      🏨
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{activity.name}</p>
                    {activity.description && (
                      <p className="truncate text-xs text-zinc-500">{activity.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="What's on" description="Upcoming events at the hotel.">
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing scheduled right now.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-zinc-500">
                      {event.startsAt.toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {testToolsEnabled() && <TestToolsPanel hotelId={id} />}
    </div>
  );
}
