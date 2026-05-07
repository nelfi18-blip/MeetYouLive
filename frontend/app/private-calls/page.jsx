"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";


// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';


export default function PrivateCallsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/creator");
  }, [router]);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#94a3b8", fontSize: "0.9rem" }}>
      Redirigiendo…
    </div>
  );
}
