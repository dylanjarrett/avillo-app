import { handleStripeEvent } from "@/enterprise/webhooks/stripe/handler";

export async function POST(req) {
  const event = await req.json();
  await handleStripeEvent(event);
  return Response.json({ received: true });
}
