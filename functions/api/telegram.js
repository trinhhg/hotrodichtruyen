export async function onRequestPost(ctx) {
  const data = await ctx.request.json()

  // xử lý telegram ở đây

  return new Response("ok")
}
