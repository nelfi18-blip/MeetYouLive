"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [error] = useState("");

  useEffect(() => {

    if (status === "unauthenticated") {
      window.location.href = "/login";
      return;
    }

    if (status !== "authenticated") return;

    if (session?.backendToken) {
      localStorage.setItem("token", session.backendToken);
    } else {
      localStorage.removeItem("token");
    }

    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

  }, [session, status]);

  if (status === "loading") {
    return null;
  }

  if (error) {
    return null;
  }

  return (
    <div></div>
  );
}
