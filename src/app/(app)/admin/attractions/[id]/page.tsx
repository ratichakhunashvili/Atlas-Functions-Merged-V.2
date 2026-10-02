import { notFound } from "next/navigation";
import Link from "next/link";
import { deleteAttraction, regenerateAttractionQrToken } from "@/actions/attractions";
import { getAchievementForPlace, getAttractionById } from "@/db/queries";
import AttractionForm from "@/components/admin/AttractionForm";
import AchievementForm from "@/components/admin/AchievementForm";
import QrCodeCard from "@/components/admin/QrCodeCard";
import DeleteButton from "@/components/admin/DeleteButton";
import { Card } from "@/components/ui";

export default async function AdminAttractionPage({
  params,
}: PageProps<"/admin/attractions/[id]">) {
  const { id } = await params;
  const attraction = await getAttractionById(id);
  if (!attraction) notFound();

  const achievement = await getAchievementForPlace("attraction", id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/attractions" className="text-sm text-indigo-600 hover:underline">
            ← Attractions
          </Link>
          <h1 className="text-2xl font-semibold">{attraction.name}</h1>
        </div>
        <DeleteButton
          size="md"
          label="Delete attraction"
          redirectTo="/admin/attractions"
          onDelete={async () => {
            "use server";
            await deleteAttraction(id);
          }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title="Details">
          <AttractionForm attraction={attraction} />
        </Card>

        <div className="space-y-5">
          <Card title="QR code" description="Print and place this at the location.">
            <QrCodeCard
              title={attraction.name}
              qrSrc={`/api/attractions/${id}/qr`}
              token={attraction.qrToken}
              onRegenerate={async () => {
                "use server";
                await regenerateAttractionQrToken(id);
              }}
            />
          </Card>

          <Card title="Achievement">
            <AchievementForm
              placeType="attraction"
              placeId={id}
              placeName={attraction.name}
              existing={achievement}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
