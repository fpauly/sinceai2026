import { connection } from "next/server";
import { createDemoCopy, TRY_TEMPLATES } from "@/lib/demo/try";

// GET /try — makes a private copy of a demo business for this visitor and opens its chat.
//   /try                 Pub Kulma, WhatsApp (the QR code in the video)
//   /try?b=FI-D0001      Kahvila Aurora, SMS
// Every visit gets its own copy, so many people can try it at once and each starts fresh.
export async function GET(request: Request) {
  await connection();
  const asked = new URL(request.url).searchParams.get("b");
  const template = TRY_TEMPLATES.find((t) => t === asked) ?? TRY_TEMPLATES[0];
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  try {
    const copy = await createDemoCopy(template);
    if (!copy.ok) return new Response(copy.error, { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    return new Response(null, { status: 303, headers: { ...headers, Location: `/contact/${copy.businessId}` } });
  } catch (err) {
    console.error("[try] could not create a demo copy", err);
    return new Response("The demo could not start. Please try again.", { status: 500, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
