/**
 * OpenAI plugin-directory domain verification: the portal's token, served as
 * bare text. Anything else in the body (JSON, a list) fails the check.
 */
export async function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("Not Found", { status: 404 });
  return new Response(token, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
