"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a story is still generating (e.g. opened on a second device), poll the
 * server every few seconds so the page flips to the player the moment it's ready.
 */
export default function PendingRefresher() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
