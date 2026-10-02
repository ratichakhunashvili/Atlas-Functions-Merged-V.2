import { getRecentCheckIns } from "@/db/queries";
import { PLACE_TYPE_LABELS } from "@/lib/place";
import { Badge, Card } from "@/components/ui";

export default async function AdminCheckInsPage() {
  // Names come resolved from the query — `place_id` points into one of three
  // tables, so a single shared lookup keeps every screen consistent.
  const checkIns = await getRecentCheckIns(100);

  return (
    <Card
      title="Check-ins"
      description="One row per guest and place — repeat visits bump the count rather than adding a row."
    >
      {checkIns.length === 0 ? (
        <p className="text-sm text-zinc-500">No check-ins yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Place</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Verified by</th>
                <th className="py-2 pr-3">Visits</th>
                <th className="py-2 pr-3">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {checkIns.map((row) => (
                <tr key={`${row.username}-${row.placeType}-${row.placeId}`}>
                  <td className="py-2.5 pr-3 font-medium">{row.username}</td>
                  <td className="py-2.5 pr-3">
                    {row.placeName ?? <span className="text-zinc-400">deleted place</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-500">
                    {PLACE_TYPE_LABELS[row.placeType]}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone="indigo">{row.verificationMode.toUpperCase()}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-500">{row.checkInCount}</td>
                  <td className="py-2.5 pr-3 text-zinc-500">
                    {row.lastCheckedInAt.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
