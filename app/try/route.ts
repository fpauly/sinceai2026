import { connection } from "next/server";
import { createDemoCopy, DEFAULT_TEMPLATE, isDemoTemplate } from "@/lib/demo/try";

// GET /try — makes a private copy of a demo business for this visitor and opens its chat.
//   /try                       Pub Kulma, WhatsApp (the QR code in the video)
//   /try?b=FI-D0001            Kahvila Aurora, SMS (publishes to the Yext sandbox)
//   /try?b=<any demo id>&to=owner   the dashboard's links (#107): open the owner page of the copy
// A business with nothing waiting opens its original page: there is nothing to change there.
// Every visit gets its own copy, so many people can try it at once and each starts fresh.
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const asked = params.get("b") ?? "";
  const template = isDemoTemplate(asked) ? asked : DEFAULT_TEMPLATE;
  const page = params.get("to") === "owner" ? "owner" : "contact";
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  try {
    const copy = await createDemoCopy(template);
    if (!copy.ok) return new Response(copy.error, { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    return new Response(null, { status: 303, headers: { ...headers, Location: `/${page}/${encodeURIComponent(copy.businessId)}` } });
  } catch (err) {
    console.error("[try] could not create a demo copy", err);
    return new Response("The demo could not start. Please try again.", { status: 500, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
