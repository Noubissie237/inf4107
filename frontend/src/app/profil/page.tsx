import { ProfileContent } from "@/components/ProfileContent";
import { RequireAuth } from "@/components/RequireAuth";

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}
