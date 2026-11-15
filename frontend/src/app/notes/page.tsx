import { NotesContent } from "@/components/NotesContent";
import { RequireAuth } from "@/components/RequireAuth";

export default function NotesPage() {
  return (
    <RequireAuth>
      <NotesContent />
    </RequireAuth>
  );
}
