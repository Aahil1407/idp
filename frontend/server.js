import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import handler from "serve-handler";

const distDirectory = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3000);

const server = createServer(async (request, response) => {
  try {
    await handler(request, response, {
      public: distDirectory,
      rewrites: [{ source: "/group/**", destination: "/index.html" }],
    });
  } catch (error) {
    console.error("Static file request failed:", error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.end("Internal Server Error");
    }
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`SmartSplit frontend listening on port ${port}`);
});
