import Link from "next/link";
import Image from "next/image";
import { deleteAttraction } from "@/actions/attractions";
import { getAllAttractions } from "@/db/queries";
import { CATEGORY_LABELS } from "@/lib/partner-category";
import AttractionForm from "@/components/admin/AttractionForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { Badge, Card } from "@/components/ui";

export default async function AdminAttractionsPage() {
  const attractions = await getAllAttractions();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
      <Card
        title="Attractions"
        description="Public places shown to guests of every hotel within walking distance."
      >
        {attractions.length === 0 ? (
          <p className="text-sm text-zinc-500">No attractions yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {attractions.map((attraction) => (
              <li key={attraction.id} className="flex items-center gap-3 py-3">
                <Image
                  src={attraction.photoPath}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/attractions/${attraction.id}`}
                    className="font-medium hover:underline"
                  >
                    {attraction.name}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {CATEGORY_LABELS[attraction.category]} ·{" "}
                    {attraction.verificationMode.toUpperCase()} check-in
                  </p>
                </div>
                {attraction.modelPath && <Badge tone="indigo">3D</Badge>}
                {attraction.latitude == null && <Badge tone="amber">No location</Badge>}
                <DeleteButton
                  onDelete={async () => {
                    "use server";
                    await deleteAttraction(attraction.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Add an attraction">
        <AttractionForm />
      </Card>
    </div>
  );
}
