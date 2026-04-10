const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HAS_EXPLICIT_PORT = Boolean(process.env.PORT);
const MAX_PORT_ATTEMPTS = 10;
const CLAUSE_REVIEW_API_URL =
  process.env.CLAUSE_REVIEW_API_URL ||
  "http://dev.gravity.ind.in:9098/pii-miner/v1/contracts/clause-review/report";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 25 * 1024 * 1024
  }
});

app.post("/api/contracts/clause-review/report", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({
      message: "A PDF file is required in the multipart field named \"file\"."
    });
    return;
  }

  if (!isPdfFile(req.file)) {
    res.status(400).json({
      message: "Only PDF files are supported."
    });
    return;
  }

  try {
    const formData = new FormData();
    const file = new File([req.file.buffer], req.file.originalname, {
      type: req.file.mimetype || "application/pdf"
    });
    formData.append("file", file);

    const upstreamResponse = await fetch(CLAUSE_REVIEW_API_URL, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!isJson) {
      const text = await upstreamResponse.text();
      res.status(upstreamResponse.ok ? 502 : upstreamResponse.status).json({
        message: upstreamResponse.ok
          ? "The upstream API returned a non-JSON response."
          : "The upstream API request failed.",
        details: truncate(text, 2000)
      });
      return;
    }

    const payload = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        message:
          payload.message ||
          payload.detail ||
          `The upstream API request failed with status ${upstreamResponse.status}.`,
        details: payload
      });
      return;
    }

    res.status(upstreamResponse.status).json(payload);
  } catch (error) {
    if (error && error.name === "TimeoutError") {
      res.status(504).json({
        message: "The contract analysis request timed out before the upstream API responded."
      });
      return;
    }

    res.status(502).json({
      message: "Unable to reach the upstream contract review API.",
      details: error && error.message ? error.message : "Unknown network error."
    });
  }
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        message: "The uploaded PDF exceeds the 25 MB limit."
      });
      return;
    }

    res.status(400).json({
      message: "The upload request could not be processed.",
      details: error.message
    });
    return;
  }

  if (error) {
    res.status(500).json({
      message: "The web app encountered an unexpected server error.",
      details: error.message
    });
    return;
  }

  next();
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/styles.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/app.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

startServer(PORT);

function isPdfFile(file) {
  const mimeType = String(file.mimetype || "").toLowerCase();
  const name = String(file.originalname || "").toLowerCase();
  return mimeType === "application/pdf" || name.endsWith(".pdf");
}

function truncate(value, maxLength) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function startServer(initialPort) {
  let attempt = 0;

  const tryListen = (port) => {
    const server = app.listen(port);

    server.once("listening", () => {
      console.log(`Contract review app listening on http://localhost:${port}`);
    });

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        if (HAS_EXPLICIT_PORT) {
          console.error(`Port ${port} is already in use. Set PORT to a different value and try again.`);
          process.exit(1);
        }

        if (attempt < MAX_PORT_ATTEMPTS) {
          const nextPort = port + 1;
          attempt += 1;
          console.warn(`Port ${port} is already in use. Retrying on ${nextPort}...`);
          tryListen(nextPort);
          return;
        }

        console.error(
          `Unable to start the contract review app after checking ports ${initialPort}-${
            initialPort + MAX_PORT_ATTEMPTS
          }.`
        );
        process.exit(1);
      }

      throw error;
    });
  };

  tryListen(initialPort);
}
