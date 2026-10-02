import Link from "next/link";
import { getAllAttractions, getAllHotels, getAllPartners } from "@/db/queries";
import { PLACE_TYPE_LABELS, type PlaceType } from "@/lib/place";
import { Badge, Card } from "@/components/ui";

type ModelRow = {
  placeType: PlaceType;
  id: string;
  name: string;
  modelPath: string | null;
  enabled: boolean;
  heightMeters: number;
  rotationDeg: number;
  elevationOffsetMeters: number;
  scaleMultiplier: number;
};

export default async function AdminModelsPage() {
  const [hotels, attractions, partners] = await Promise.all([
    getAllHotels(),
    getAllAttractions(),
    getAllPartners(),
  ]);

  const rows: ModelRow[] = [
    ...hotels.map((h) => ({
      placeType: "hotel" as const,
      id: h.id,
      name: h.name,
      modelPath: h.modelPath,
      enabled: h.model3dEnabled,
      heightMeters: h.modelTargetHeightMeters,
      rotationDeg: h.modelRotationDeg,
      elevationOffsetMeters: h.modelElevationOffsetMeters,
      scaleMultiplier: h.modelScaleMultiplier,
    })),
    ...attractions.map((a) => ({
      placeType: "attraction" as const,
      id: a.id,
      name: a.name,
      modelPath: a.modelPath,
      enabled: a.model3dEnabled,
      heightMeters: a.modelTargetHeightMeters,
      rotationDeg: a.modelRotationDeg,
      elevationOffsetMeters: a.modelElevationOffsetMeters,
      scaleMultiplier: a.modelScaleMultiplier,
    })),
    ...partners.map((p) => ({
      placeType: "partner" as const,
      id: p.id,
      name: p.name,
      modelPath: p.modelPath,
      enabled: p.model3dEnabled,
      heightMeters: p.modelTargetHeightMeters,
      rotationDeg: p.modelRotationDeg,
      elevationOffsetMeters: p.modelElevationOffsetMeters,
      scaleMultiplier: p.modelScaleMultiplier,
    })),
  ];

  const withModel = rows.filter((row) => row.modelPath);

  return (
    <Card
      title="3D models"
      description="Models belong to the place itself — upload and adjust them on that place's page. Places without a model show a coloured marker shape instead."
    >
      <p className="mb-4 text-sm text-zinc-500">
        {withModel.length} of {rows.length} places have a custom .glb.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="py-2 pr-3">Place</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Model</th>
              <th className="py-2 pr-3">Height</th>
              <th className="py-2 pr-3">Rotation</th>
              <th className="py-2 pr-3">Lift</th>
              <th className="py-2 pr-3">Scale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr key={`${row.placeType}-${row.id}`}>
                <td className="py-2.5 pr-3">
                  <Link
                    href={`/admin/${row.placeType}s/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-zinc-500">
                  {PLACE_TYPE_LABELS[row.placeType]}
                </td>
                <td className="py-2.5 pr-3">
                  {!row.enabled ? (
                    <Badge tone="neutral">Hidden</Badge>
                  ) : row.modelPath ? (
                    <Badge tone="indigo">.glb</Badge>
                  ) : (
                    <Badge tone="neutral">Marker shape</Badge>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-zinc-500">{row.heightMeters} m</td>
                <td className="py-2.5 pr-3 text-zinc-500">{row.rotationDeg}°</td>
                <td className="py-2.5 pr-3 text-zinc-500">{row.elevationOffsetMeters} m</td>
                <td className="py-2.5 pr-3 text-zinc-500">×{row.scaleMultiplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
