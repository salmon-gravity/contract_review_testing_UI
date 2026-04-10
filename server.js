const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const express = require("express");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HAS_EXPLICIT_PORT = Boolean(process.env.PORT);
const MAX_PORT_ATTEMPTS = 10;
const CLAUSE_REVIEW_API_URL =
  process.env.CLAUSE_REVIEW_API_URL ||
  "http://dev.gravity.ind.in:9098/pii-miner/v1/contracts/clause-review/report";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const REVIEW_STORAGE_DIR = path.join(__dirname, "storage", "reviews");
const REVIEW_SOURCE_STORAGE_DIR = path.join(__dirname, "storage", "review-files");
const REVIEW_FILE_EXTENSION = ".json";
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const DOCUMENT_MIME_TYPES_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
]);
const SUPPORTED_DOCUMENT_MIME_TYPES = new Set(Array.from(DOCUMENT_MIME_TYPES_BY_EXTENSION.values()));
const ALLOWED_VERDICTS = new Set(["unreviewed", "correct", "incorrect"]);
const DELETE_ALL_REVIEWS_PASSWORD = "Gravity";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

app.use(express.json({ limit: "1mb" }));

app.post("/api/contracts/clause-review/report", upload.single("file"), async (req, res) => {
  try {
    const file = getValidatedDocumentFile(req.file);
    const analysis = await analyzeContract(file);
    res.status(200).json(analysis);
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.post("/api/reviews", upload.single("file"), async (req, res) => {
  try {
    const file = getValidatedDocumentFile(req.file);
    const analysis = await analyzeContract(file);
    const reviewRecord = createReviewRecord(file, analysis);
    const reviewFilePath = getReviewFilePath(
      reviewRecord.review_id,
      reviewRecord.source.file_name,
      reviewRecord.created_at
    );
    const sourceFilePath = getStoredSourceFilePath(reviewRecord.source.stored_file_name);

    await writeStoredSourceFile(sourceFilePath, req.file.buffer);
    try {
      await writeReviewRecord(reviewFilePath, reviewRecord);
    } catch (error) {
      await deleteStoredSourceFileIfExists(reviewRecord.source.stored_file_name);
      throw error;
    }

    res.status(201).json(reviewRecord);
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.get("/api/reviews", async (_req, res) => {
  try {
    const reviews = await listReviewSummaries();
    res.status(200).json({ reviews });
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.delete("/api/reviews", async (req, res) => {
  try {
    assertDeleteAllPassword(req.body && req.body.password);
    const deletionResult = await deleteAllReviewArtifacts();
    res.status(200).json(deletionResult);
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.get("/api/reviews/:reviewId", async (req, res) => {
  try {
    const reviewRecord = await readReviewRecordById(req.params.reviewId);
    res.status(200).json(reviewRecord);
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.get("/api/reviews/:reviewId/file", async (req, res) => {
  try {
    const reviewRecord = await readReviewRecordById(req.params.reviewId);

    if (!reviewRecord.source.download_available || !reviewRecord.source.stored_file_name) {
      throw createHttpError(404, "The saved review does not have a downloadable source file.");
    }

    const filePath = getStoredSourceFilePath(reviewRecord.source.stored_file_name);
    res.type(getDocumentMimeType(reviewRecord.source.mime_type, reviewRecord.source.file_name));
    res.download(filePath, reviewRecord.source.download_name || reviewRecord.source.file_name, (error) => {
      if (!error || res.headersSent) {
        return;
      }

      if (error.code === "ENOENT") {
        sendHttpError(res, createHttpError(404, "The saved source file was not found on disk."));
        return;
      }

      sendHttpError(res, createHttpError(500, "Unable to download the saved source file.", error.message));
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.patch("/api/reviews/:reviewId/controls/:controlId", async (req, res) => {
  try {
    const reviewId = assertReviewId(req.params.reviewId);
    const reviewRecord = await readReviewRecordById(reviewId);
    const controlId = String(req.params.controlId || "").trim();

    if (!controlId) {
      throw createHttpError(400, "A control identifier is required.");
    }

    const controlExists = reviewRecord.analysis.controls.some((control) => control.control_id === controlId);
    if (!controlExists) {
      throw createHttpError(404, `Control "${controlId}" was not found in the saved review.`);
    }

    const verdict = normalizeVerdict(req.body && req.body.verdict);
    const remarks = normalizeRemarks(req.body && req.body.remarks);
    const reviewedAt = verdict === "unreviewed" ? null : new Date().toISOString();

    reviewRecord.control_reviews[controlId] = {
      verdict,
      remarks,
      reviewed_at: reviewedAt
    };
    reviewRecord.updated_at = new Date().toISOString();

    const filePath = await findReviewFilePath(reviewId);
    await writeReviewRecord(filePath, reviewRecord);

    res.status(200).json({
      review_id: reviewRecord.review_id,
      control_id: controlId,
      updated_at: reviewRecord.updated_at,
      control_review: reviewRecord.control_reviews[controlId]
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        message: `The uploaded file exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.`
      });
      return;
    }

    res.status(400).json({
      message: "The upload request could not be processed.",
      details: error.message
    });
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    res.status(400).json({
      message: "The request body must be valid JSON."
    });
    return;
  }

  if (error) {
    sendHttpError(res, error);
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

ensureStorageDirectories().catch((error) => {
  console.error("Unable to prepare local review storage.", error);
});

startServer(PORT);

function getValidatedDocumentFile(file) {
  if (!file) {
    throw createHttpError(
      400,
      "A supported document file is required in the multipart field named \"file\"."
    );
  }

  const mimeType = String(file.mimetype || "").toLowerCase();
  const extension = getDocumentFileExtension(file.originalname);
  if (!SUPPORTED_DOCUMENT_MIME_TYPES.has(mimeType) && !SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
    throw createHttpError(400, "Only PDF, DOC, and DOCX files are supported.");
  }

  return file;
}

async function analyzeContract(file) {
  try {
    const formData = new FormData();
    const uploadedFile = new File([file.buffer], file.originalname, {
      type: getDocumentMimeType(file.mimetype, file.originalname)
    });
    formData.append("file", uploadedFile);

    const upstreamResponse = await fetch(CLAUSE_REVIEW_API_URL, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!isJson) {
      const text = await upstreamResponse.text();
      throw createHttpError(
        upstreamResponse.ok ? 502 : upstreamResponse.status,
        upstreamResponse.ok
          ? "The upstream API returned a non-JSON response."
          : "The upstream API request failed.",
        truncate(text, 2000)
      );
    }

    const payload = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      throw createHttpError(
        upstreamResponse.status,
        payload.message ||
          payload.detail ||
          `The upstream API request failed with status ${upstreamResponse.status}.`,
        payload
      );
    }

    validateContractResponse(payload);
    return payload;
  } catch (error) {
    if (error && error.status) {
      throw error;
    }

    if (error && error.name === "TimeoutError") {
      throw createHttpError(
        504,
        "The contract analysis request timed out before the upstream API responded."
      );
    }

    throw createHttpError(
      502,
      "Unable to reach the upstream contract review API.",
      error && error.message ? error.message : "Unknown network error."
    );
  }
}

function validateContractResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createHttpError(
      502,
      "The upstream API returned an invalid contract review payload.",
      "The JSON root must be an object."
    );
  }

  if (!Array.isArray(data.controls)) {
    throw createHttpError(
      502,
      "The upstream API returned an invalid contract review payload.",
      "The response is missing a valid controls array."
    );
  }

  data.controls.forEach((control, index) => {
    if (!control || typeof control !== "object" || Array.isArray(control)) {
      throw createHttpError(
        502,
        "The upstream API returned an invalid contract review payload.",
        `Control ${index + 1} must be an object.`
      );
    }

    const requiredFields = ["control_id", "title", "status", "confidence", "reason"];
    requiredFields.forEach((fieldName) => {
      if (control[fieldName] === undefined || control[fieldName] === null || control[fieldName] === "") {
        throw createHttpError(
          502,
          "The upstream API returned an invalid contract review payload.",
          `Control ${index + 1} is missing required field "${fieldName}".`
        );
      }
    });
  });
}

function createReviewRecord(file, analysis) {
  const timestamp = new Date().toISOString();
  const reviewId = crypto.randomUUID();
  const fileExtension = getDocumentFileExtension(file.originalname, file.mimetype) || ".pdf";
  const downloadName = String(file.originalname || "").trim() || `Uploaded contract${fileExtension}`;
  const storedFileName = getStoredSourceFileName(reviewId, downloadName, timestamp, file.mimetype);

  return {
    review_id: reviewId,
    created_at: timestamp,
    updated_at: timestamp,
    source: {
      file_name: downloadName,
      mime_type: getDocumentMimeType(file.mimetype, downloadName),
      file_size: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
      request_id: asNullableString(analysis.request_id),
      stored_file_name: storedFileName,
      download_name: downloadName,
      download_available: true
    },
    analysis,
    control_reviews: buildDefaultControlReviews(analysis.controls)
  };
}

function buildDefaultControlReviews(controls) {
  const controlReviews = {};

  controls.forEach((control) => {
    const controlId = String(control.control_id || "").trim();
    if (!controlId) {
      return;
    }

    controlReviews[controlId] = {
      verdict: "unreviewed",
      remarks: "",
      reviewed_at: null
    };
  });

  return controlReviews;
}

async function deleteAllReviewArtifacts() {
  await ensureStorageDirectories();
  const reviewFileNames = await listReviewFileNames();
  const storedSourceFileNames = await listStoredSourceFileNames();

  try {
    await Promise.all(reviewFileNames.map((fileName) => fs.unlink(path.join(REVIEW_STORAGE_DIR, fileName))));
    await Promise.all(
      storedSourceFileNames.map((fileName) => fs.unlink(path.join(REVIEW_SOURCE_STORAGE_DIR, fileName)))
    );
  } catch (error) {
    throw createHttpError(500, "Unable to delete the saved review artifacts.", error.message);
  }

  return {
    deleted_count: reviewFileNames.length,
    deleted_file_count: storedSourceFileNames.length
  };
}

async function listReviewSummaries() {
  await ensureReviewStorageDirectory();
  const fileNames = await listReviewFileNames();
  const summaries = [];

  for (const fileName of fileNames) {
    const filePath = path.join(REVIEW_STORAGE_DIR, fileName);
    const record = await readReviewRecord(filePath);
    summaries.push(buildReviewSummary(record));
  }

  return summaries.sort((left, right) => {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

function buildReviewSummary(record) {
  const progress = countReviewVerdicts(record.analysis.controls, record.control_reviews);

  return {
    review_id: record.review_id,
    file_name: record.source.file_name,
    request_id: record.source.request_id,
    download_available: Boolean(record.source.download_available),
    download_name: record.source.download_name || record.source.file_name,
    risk_level: normalizeRiskLevel(
      record.analysis && record.analysis.overall_assessment && record.analysis.overall_assessment.risk_level
    ),
    created_at: record.created_at,
    updated_at: record.updated_at,
    total_controls: Array.isArray(record.analysis.controls) ? record.analysis.controls.length : 0,
    verdict_counts: progress
  };
}

function countReviewVerdicts(controls, controlReviews) {
  return controls.reduce(
    (counts, control) => {
      const controlId = String(control.control_id || "").trim();
      const review = controlReviews[controlId];
      const verdict = review ? review.verdict : "unreviewed";

      if (verdict === "correct") {
        counts.correct += 1;
        counts.reviewed += 1;
      } else if (verdict === "incorrect") {
        counts.incorrect += 1;
        counts.reviewed += 1;
      } else {
        counts.unreviewed += 1;
      }

      return counts;
    },
    { reviewed: 0, correct: 0, incorrect: 0, unreviewed: 0 }
  );
}

async function readReviewRecordById(reviewId) {
  const safeReviewId = assertReviewId(reviewId);
  const filePath = await findReviewFilePath(safeReviewId);
  return readReviewRecord(filePath);
}

async function readReviewRecord(filePath) {
  let rawText;

  try {
    rawText = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw createHttpError(404, "The requested saved review was not found.");
    }

    throw createHttpError(500, "Unable to read the saved review file.", error.message);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw createHttpError(500, "A saved review file is not valid JSON.", error.message);
  }

  const normalizedRecord = normalizeStoredReviewRecord(parsed);
  return applyStoredSourceAvailability(normalizedRecord);
}

function normalizeStoredReviewRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw createHttpError(500, "A saved review file has an invalid top-level structure.");
  }

  validateContractResponse(record.analysis);

  const reviewId = assertReviewId(record.review_id);
  const createdAt = normalizeTimestamp(record.created_at);
  const updatedAt = normalizeTimestamp(record.updated_at) || createdAt;

  return {
    review_id: reviewId,
    created_at: createdAt,
    updated_at: updatedAt,
    source: {
      file_name: resolveStoredFileName(record),
      mime_type: getDocumentMimeType(
        asNullableString(record.source && record.source.mime_type),
        resolveStoredFileName(record)
      ),
      file_size: toNumberOrNull(record.source && record.source.file_size),
      request_id:
        asNullableString(record.source && record.source.request_id) ||
        asNullableString(record.analysis && record.analysis.request_id),
      stored_file_name: asNullableString(record.source && record.source.stored_file_name),
      download_name:
        asNullableString(record.source && record.source.download_name) || resolveStoredFileName(record),
      download_available: Boolean(asNullableString(record.source && record.source.stored_file_name))
    },
    analysis: record.analysis,
    control_reviews: normalizeStoredControlReviews(record.control_reviews, record.analysis.controls)
  };
}

async function applyStoredSourceAvailability(record) {
  const downloadAvailable = await hasStoredSourceFile(record.source.stored_file_name);
  return {
    ...record,
    source: {
      ...record.source,
      download_available: downloadAvailable
    }
  };
}

function normalizeStoredControlReviews(controlReviews, controls) {
  const source = controlReviews && typeof controlReviews === "object" && !Array.isArray(controlReviews)
    ? controlReviews
    : {};
  const normalized = {};

  controls.forEach((control) => {
    const controlId = String(control.control_id || "").trim();
    if (!controlId) {
      return;
    }

    const existing = source[controlId];
    const verdict = normalizeVerdict(existing && existing.verdict, true);
    const remarks = normalizeRemarks(existing && existing.remarks, true);

    normalized[controlId] = {
      verdict,
      remarks,
      reviewed_at: verdict === "unreviewed" ? null : normalizeTimestamp(existing && existing.reviewed_at)
    };
  });

  return normalized;
}

async function writeReviewRecord(filePath, record) {
  await ensureReviewStorageDirectory();

  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const json = JSON.stringify(record, null, 2);

  try {
    await fs.writeFile(tempPath, json, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw createHttpError(500, "Unable to save the local review record.", error.message);
  }
}

async function writeStoredSourceFile(filePath, fileBuffer) {
  await ensureSourceFileStorageDirectory();

  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.writeFile(tempPath, fileBuffer);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw createHttpError(500, "Unable to save the uploaded source file.", error.message);
  }
}

async function ensureReviewStorageDirectory() {
  await fs.mkdir(REVIEW_STORAGE_DIR, { recursive: true });
}

async function ensureSourceFileStorageDirectory() {
  await fs.mkdir(REVIEW_SOURCE_STORAGE_DIR, { recursive: true });
}

async function ensureStorageDirectories() {
  await Promise.all([ensureReviewStorageDirectory(), ensureSourceFileStorageDirectory()]);
}

async function listReviewFileNames() {
  const entries = await fs.readdir(REVIEW_STORAGE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(REVIEW_FILE_EXTENSION))
    .map((entry) => entry.name);
}

async function listStoredSourceFileNames() {
  const entries = await fs.readdir(REVIEW_SOURCE_STORAGE_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

async function findReviewFilePath(reviewId) {
  await ensureReviewStorageDirectory();
  const fileNames = await listReviewFileNames();
  const match = fileNames.find((fileName) => fileName.endsWith(`--${reviewId}${REVIEW_FILE_EXTENSION}`));

  if (!match) {
    throw createHttpError(404, "The requested saved review was not found.");
  }

  return path.join(REVIEW_STORAGE_DIR, match);
}

function getReviewFilePath(reviewId, fileName, timestamp) {
  const safeReviewId = assertReviewId(reviewId);
  const timestampSlug = String(timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
  const safeBaseName = sanitizeFileStem(fileName);
  return path.join(REVIEW_STORAGE_DIR, `${timestampSlug}--${safeBaseName}--${safeReviewId}${REVIEW_FILE_EXTENSION}`);
}

function getStoredSourceFilePath(storedFileName) {
  const safeFileName = String(storedFileName || "").trim();
  if (!safeFileName) {
    throw createHttpError(404, "The saved review does not have a stored source file.");
  }

  if (path.basename(safeFileName) !== safeFileName) {
    throw createHttpError(500, "The saved review contains an invalid stored file reference.");
  }

  return path.join(REVIEW_SOURCE_STORAGE_DIR, safeFileName);
}

function getStoredSourceFileName(reviewId, fileName, timestamp, mimeType) {
  const safeReviewId = assertReviewId(reviewId);
  const timestampSlug = String(timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
  const safeBaseName = sanitizeFileStem(fileName);
  const fileExtension = getDocumentFileExtension(fileName, mimeType) || ".pdf";
  return `${timestampSlug}--${safeBaseName}--${safeReviewId}${fileExtension}`;
}

async function hasStoredSourceFile(storedFileName) {
  if (!storedFileName) {
    return false;
  }

  try {
    await fs.access(getStoredSourceFilePath(storedFileName));
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw createHttpError(500, "Unable to inspect the saved source file.", error.message);
  }
}

async function deleteStoredSourceFileIfExists(storedFileName) {
  if (!storedFileName) {
    return;
  }

  try {
    await fs.rm(getStoredSourceFilePath(storedFileName), { force: true });
  } catch (_error) {
    // Best-effort cleanup only.
  }
}

function sanitizeFileStem(fileName) {
  const rawBaseName = path.parse(String(fileName || "contract-review")).name || "contract-review";
  const normalized = rawBaseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return normalized || "contract-review";
}

function getDocumentFileExtension(fileName, mimeType) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  if (SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
    return extension;
  }

  const normalizedMimeType = String(mimeType || "").toLowerCase();
  for (const [candidateExtension, candidateMimeType] of DOCUMENT_MIME_TYPES_BY_EXTENSION.entries()) {
    if (candidateMimeType === normalizedMimeType) {
      return candidateExtension;
    }
  }

  return "";
}

function getDocumentMimeType(mimeType, fileName) {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  if (SUPPORTED_DOCUMENT_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType;
  }

  const extension = getDocumentFileExtension(fileName);
  return DOCUMENT_MIME_TYPES_BY_EXTENSION.get(extension) || "application/octet-stream";
}

function assertReviewId(value) {
  const reviewId = String(value || "").trim();
  if (!/^[a-zA-Z0-9-]{8,}$/.test(reviewId)) {
    throw createHttpError(400, "The review identifier is invalid.");
  }
  return reviewId;
}

function resolveStoredFileName(record) {
  return (
    asNullableString(record.source && record.source.file_name) ||
    asNullableString(record.analysis && record.analysis.document_meta && record.analysis.document_meta.file_name) ||
    "Saved contract review"
  );
}

function assertDeleteAllPassword(password) {
  if (password !== DELETE_ALL_REVIEWS_PASSWORD) {
    throw createHttpError(403, "Incorrect password. Saved reviews were not deleted.");
  }
}

function normalizeVerdict(value, allowFallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (ALLOWED_VERDICTS.has(normalized)) {
    return normalized;
  }

  if (allowFallback) {
    return "unreviewed";
  }

  throw createHttpError(400, "Verdict must be one of: unreviewed, correct, incorrect.");
}

function normalizeRemarks(value, allowFallback = false) {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (allowFallback) {
    return "";
  }

  throw createHttpError(400, "Remarks must be a string.");
}

function normalizeRiskLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return "medium";
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function toNumberOrNull(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function asNullableString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function sendHttpError(res, error) {
  const status = Number(error && error.status) || 500;
  const message =
    (error && error.message) || "The web app encountered an unexpected server error.";

  const payload = { message };
  if (error && error.details !== undefined) {
    payload.details = error.details;
  }

  res.status(status).json(payload);
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
