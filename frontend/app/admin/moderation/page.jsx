"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";


// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';


export default function AdminModerationPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/reports"); }, [router]);
  return null;
}
