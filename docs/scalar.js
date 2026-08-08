import express from "express";
import openApiDocument from "./openapi.js";

const router = express.Router();

const scalarHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trip Planner API Reference</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api-docs/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

router.get("/openapi.json", (req, res) => {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const apiBaseUrl = `${protocol}://${req.get("host")}/api`;

  res.json({
    ...openApiDocument,
    servers: [
      {
        url: apiBaseUrl,
        description: "The server currently hosting this reference",
      },
    ],
  });
});

router.get("/", (req, res) => {
  // Helmet's application-wide CSP intentionally blocks third-party scripts.
  // This narrower policy permits Scalar's browser bundle only on this page.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; connect-src 'self' http: https: ws: wss:; img-src 'self' data: blob: https:;",
  );
  res.type("html").send(scalarHtml);
});

export default router;
