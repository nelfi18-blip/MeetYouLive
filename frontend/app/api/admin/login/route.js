import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const FALLBACK_URL = "https://meetyoulive.onrender.com";
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.API_URL ||
      FALLBACK_URL;

    if (!process.env.NEXT_PUBLIC_API_URL && !process.env.API_URL) {
      console.warn("⚠️ API URL env var not set, using fallback:", FALLBACK_URL);
    }

    console.log("🌐 Proxy admin/login a:", apiUrl);

    const response = await fetch(`${apiUrl}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch((err) => {
      console.error("❌ Error parsing backend response:", err);
      return null;
    });

    return NextResponse.json(
      data ?? { message: "No se pudo leer la respuesta del backend" },
      { status: response.status }
    );
  } catch (error) {
    console.error("❌ Proxy error:", error);

    return NextResponse.json(
      { message: "No se pudo conectar con el backend" },
      { status: 500 }
    );
  }
}
