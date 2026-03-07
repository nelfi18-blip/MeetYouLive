import { NextResponse } from "next/server";
import stripe from "@/lib/stripe";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/Transaction";
import UserWallet from "@/models/UserWallet";

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return NextResponse.json(
      { message: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, coins } = session.metadata || {};

    if (userId && coins) {
      try {
        await dbConnect();

        await Transaction.create({
          user: userId,
          type: "coin_purchase",
          amount: session.amount_total,
          coins: Number(coins),
          stripeSessionId: session.id,
          status: "completed",
        });

        await UserWallet.findOneAndUpdate(
          { user: userId },
          {
            $inc: { coins: Number(coins), totalEarned: Number(coins) },
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error("Error processing webhook:", err);
        return NextResponse.json(
          { message: "Error al procesar el pago" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
