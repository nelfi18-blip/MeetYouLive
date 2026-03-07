import { NextResponse } from "next/server";
import stripe from "@/lib/stripe";

const COIN_PACKAGES = {
  100: { coins: 100, price: 99 },
  500: { coins: 500, price: 449 },
  1000: { coins: 1000, price: 799 },
};

export async function POST(request) {
  try {
    const { packageValue, userId } = await request.json();

    const pkg = COIN_PACKAGES[packageValue];
    if (!pkg) {
      return NextResponse.json({ message: "Paquete inválido" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: pkg.price,
            product_data: {
              name: `${pkg.coins} Monedas MeetYouLive`,
              description: `Paquete de ${pkg.coins} monedas para usar en regalos y directos`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId || "",
        coins: pkg.coins,
        packageValue,
      },
      success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/coins`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { message: "Error al crear la sesión de pago" },
      { status: 500 }
    );
  }
}
