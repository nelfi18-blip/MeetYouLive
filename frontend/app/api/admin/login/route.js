import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;

    if (!apiUrl) {
      return NextResponse.json(
        { message: "API backend no configurada" },
        { status: 500 }
      );
    }

    const response = await fetch(`${apiUrl}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "No se pudo conectar con el backend",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
