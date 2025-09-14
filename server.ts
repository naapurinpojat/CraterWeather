import { serve } from "bun";

// Yksinkertainen staattisten tiedostojen serveri
serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;

    try {
      const file = Bun.file(`.${path}`);
      if (await file.exists()) {
        return new Response(file);
      } else {
        return new Response("Not found", { status: 404 });
      }
    } catch {
      return new Response("Error", { status: 500 });
    }
  },
});
