import Link from "next/link";
import { auth } from "@/auth";
import { deleteUser, setUserRole } from "@/actions/users";
import { getAllUsersForAdmin } from "@/db/queries";
import DeleteButton from "@/components/admin/DeleteButton";
import RoleToggle from "@/components/admin/RoleToggle";
import { Badge, Card } from "@/components/ui";

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await getAllUsersForAdmin();

  return (
    <Card
      title="Users"
      description="Guest accounts and their progress. Password hashes are never loaded here."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="py-2 pr-3">User</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Hotels</th>
              <th className="py-2 pr-3">Badges</th>
              <th className="py-2 pr-3">Check-ins</th>
              <th className="py-2 pr-3">Days</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((user) => {
              const isSelf = user.id === session?.user?.id;
              return (
                <tr key={user.id}>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium hover:underline"
                    >
                      {user.username}
                    </Link>
                    {isSelf && <span className="ml-2 text-xs text-zinc-400">(you)</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {isSelf ? (
                      <Badge tone="indigo">{user.role}</Badge>
                    ) : (
                      <RoleToggle
                        role={user.role}
                        username={user.username}
                        onChange={async (role) => {
                          "use server";
                          await setUserRole(user.id, role);
                        }}
                      />
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-500">{user.unlockedHotels}</td>
                  <td className="py-2.5 pr-3 text-zinc-500">{user.achievementCount}</td>
                  <td className="py-2.5 pr-3 text-zinc-500">{user.checkInCount}</td>
                  <td className="py-2.5 pr-3 text-zinc-500">{user.itineraryDayCount}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {!isSelf && (
                      <DeleteButton
                        onDelete={async () => {
                          "use server";
                          await deleteUser(user.id);
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
