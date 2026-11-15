import { useEffect, useState } from "react";

import { fetchPhotoBlob } from "@/lib/api";
import type { Me } from "@/lib/api";

type LoadedPhoto = { user: Me; src: string };

/**
 * Address to display for the profile photo:
 * - photo_url null: null (show the initials);
 * - absolute URL (S3 signed URL): used as is;
 * - relative path (local mode, the route needs the Authorization header): downloaded with
 *   fetch, then shown through an object URL (revoked when no longer used).
 */
export function usePhotoSrc(user: Me | null, token: string | null): string | null {
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null);
  const photoUrl = user?.photo_url ?? null;
  const isRelative = photoUrl !== null && !/^https?:\/\//i.test(photoUrl);

  useEffect(() => {
    if (!user || !token || !photoUrl || !isRelative) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchPhotoBlob(token, photoUrl).then(
      (blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ user, src: objectUrl });
        }
      },
      () => undefined, // no image: the initials stay (a 401 is handled by the next API call)
    );
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [user, token, photoUrl, isRelative]);

  if (photoUrl === null) {
    return null;
  }
  if (!isRelative) {
    return photoUrl;
  }
  // an object URL belongs to one version of the user: never show another one's photo
  return loaded?.user === user ? loaded.src : null;
}
