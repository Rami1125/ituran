import app from "./api/index";
import { createServer as createViteServer } from "vite";
import path from "path";
import express from "express";

const PORT = 3000;

// Dev vs Prod Vite Integration Middleware Wrapper
const startDevServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production assets.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Noa Ituran Server running at http://0.0.0.0:${PORT}`);
  });
};

startDevServer().catch((err) => {
  console.error("Critical error starting dev wrapper server:", err);
});
