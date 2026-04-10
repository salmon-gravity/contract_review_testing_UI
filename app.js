const REVIEW_SAVE_DELAY_MS = 700;
const VERDICT_OPTIONS = [
  { value: "unreviewed", label: "Unreviewed" },
  { value: "correct", label: "Correct" },
  { value: "incorrect", label: "Incorrect" }
];

const state = {
  rawData: null,
  normalizedData: null,
  activeReviewId: null,
  activeReviewMeta: null,
  selectedControlId: null,
  activeStatusFilter: "all",
  highRiskOnly: false,
  searchQuery: "",
  selectedFile: null,
  uploadStatus: "idle",
  uploadError: null,
  feedback: null,
  savedReviews: [],
  savedReviewsStatus: "idle",
  savedReviewsError: null,
  libraryOpen: false,
  deleteAllOpen: false,
  deleteAllPassword: "",
  deleteAllStatus: "idle",
  deleteAllError: null,
  controlReviews: {},
  controlSaveStates: {},
  controlSaveTokens: {},
  controlRemarkTimers: {},
  treeModalOpen: false,
  treeSearchQuery: "",
  expandedTreePaths: new Set(["root"])
};

const dom = {
  uploadButton: document.getElementById("uploadButton"),
  analyzeButton: document.getElementById("analyzeButton"),
  savedReviewsButton: document.getElementById("savedReviewsButton"),
  viewTreeButton: document.getElementById("viewTreeButton"),
  clearButton: document.getElementById("clearButton"),
  fileInput: document.getElementById("fileInput"),
  dropzone: document.getElementById("dropzone"),
  feedback: document.getElementById("feedback"),
  selectedFileState: document.getElementById("selectedFileState"),
  selectedFileName: document.getElementById("selectedFileName"),
  selectedFileHint: document.getElementById("selectedFileHint"),
  overviewCard: document.getElementById("overviewCard"),
  overviewHighlights: document.getElementById("overviewHighlights"),
  overviewMeta: document.getElementById("overviewMeta"),
  statsCard: document.getElementById("statsCard"),
  statsGrid: document.getElementById("statsGrid"),
  assessmentCard: document.getElementById("assessmentCard"),
  assessmentSummaryPill: document.getElementById("assessmentSummaryPill"),
  keyGapsList: document.getElementById("keyGapsList"),
  actionsList: document.getElementById("actionsList"),
  filtersCard: document.getElementById("filtersCard"),
  searchInput: document.getElementById("searchInput"),
  statusFilters: document.getElementById("statusFilters"),
  highRiskToggle: document.getElementById("highRiskToggle"),
  resetFiltersButton: document.getElementById("resetFiltersButton"),
  controlCountLabel: document.getElementById("controlCountLabel"),
  controlsCard: document.getElementById("controlsCard"),
  controlsList: document.getElementById("controlsList"),
  detailEmpty: document.getElementById("detailEmpty"),
  detailView: document.getElementById("detailView"),
  detailBadges: document.getElementById("detailBadges"),
  detailTitle: document.getElementById("detailTitle"),
  detailReason: document.getElementById("detailReason"),
  detailMetrics: document.getElementById("detailMetrics"),
  detailReviewCard: document.getElementById("detailReviewCard"),
  detailInsights: document.getElementById("detailInsights"),
  detailSections: document.getElementById("detailSections"),
  treeModal: document.getElementById("treeModal"),
  treeModalBackdrop: document.getElementById("treeModalBackdrop"),
  treeCloseButton: document.getElementById("treeCloseButton"),
  treeExpandAllButton: document.getElementById("treeExpandAllButton"),
  treeCollapseAllButton: document.getElementById("treeCollapseAllButton"),
  treeSearchInput: document.getElementById("treeSearchInput"),
  treeSearchStatus: document.getElementById("treeSearchStatus"),
  treeContent: document.getElementById("treeContent"),
  libraryModal: document.getElementById("libraryModal"),
  libraryModalBackdrop: document.getElementById("libraryModalBackdrop"),
  libraryDeleteButton: document.getElementById("libraryDeleteButton"),
  libraryCloseButton: document.getElementById("libraryCloseButton"),
  libraryRefreshButton: document.getElementById("libraryRefreshButton"),
  libraryStatusText: document.getElementById("libraryStatusText"),
  libraryDeletePanel: document.getElementById("libraryDeletePanel"),
  savedReviewsList: document.getElementById("savedReviewsList")
};

const defaultEmptyMarkup = `
  <div class="empty-state-mark">Review</div>
  <h2>Analyze a contract or open a saved review</h2>
  <p>
    Upload a PDF to create a locally saved review record, or reopen a prior contract from
    Saved Reviews and continue marking controls as correct or incorrect with remarks.
  </p>
`;

initialize();

function initialize() {
  dom.uploadButton.addEventListener("click", () => dom.fileInput.click());
  dom.analyzeButton.addEventListener("click", analyzeSelectedFile);
  dom.savedReviewsButton.addEventListener("click", openLibraryModal);
  dom.viewTreeButton.addEventListener("click", openTreeModal);
  dom.clearButton.addEventListener("click", clearViewer);
  dom.fileInput.addEventListener("change", onFileInputChange);
  dom.dropzone.addEventListener("click", () => {
    if (state.uploadStatus !== "uploading") {
      dom.fileInput.click();
    }
  });
  dom.dropzone.addEventListener("keydown", onDropzoneKeydown);
  dom.dropzone.addEventListener("dragenter", onDragEnter);
  dom.dropzone.addEventListener("dragover", onDragOver);
  dom.dropzone.addEventListener("dragleave", onDragLeave);
  dom.dropzone.addEventListener("drop", onDrop);
  dom.searchInput.addEventListener("input", onSearchInput);
  dom.statusFilters.addEventListener("click", onStatusFilterClick);
  dom.highRiskToggle.addEventListener("change", onHighRiskToggle);
  dom.resetFiltersButton.addEventListener("click", resetFilters);
  dom.controlsList.addEventListener("click", onControlsListClick);
  dom.detailView.addEventListener("click", onDetailViewClick);
  dom.detailView.addEventListener("input", onDetailViewInput);
  dom.treeCloseButton.addEventListener("click", closeTreeModal);
  dom.treeModalBackdrop.addEventListener("click", closeTreeModal);
  dom.treeExpandAllButton.addEventListener("click", expandAllTreeNodes);
  dom.treeCollapseAllButton.addEventListener("click", collapseAllTreeNodes);
  dom.treeSearchInput.addEventListener("input", onTreeSearchInput);
  dom.treeContent.addEventListener("click", onTreeContentClick);
  dom.libraryCloseButton.addEventListener("click", closeLibraryModal);
  dom.libraryModalBackdrop.addEventListener("click", closeLibraryModal);
  dom.libraryDeleteButton.addEventListener("click", openDeleteAllPanel);
  dom.libraryRefreshButton.addEventListener("click", () => {
    fetchSavedReviews();
  });
  dom.libraryDeletePanel.addEventListener("click", onLibraryDeletePanelClick);
  dom.libraryDeletePanel.addEventListener("input", onLibraryDeletePanelInput);
  dom.savedReviewsList.addEventListener("click", onSavedReviewsListClick);
  document.addEventListener("keydown", onDocumentKeydown);
  render();
  fetchSavedReviews({ silent: true });
}

async function onFileInputChange(event) {
  const file = event.target.files && event.target.files[0];
  if (file) {
    handleSelectedFile(file);
  }
  event.target.value = "";
}

function onDropzoneKeydown(event) {
  if (state.uploadStatus === "uploading") {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    dom.fileInput.click();
  }
}

function onDragEnter(event) {
  event.preventDefault();
  dom.dropzone.classList.add("is-dragover");
}

function onDragOver(event) {
  event.preventDefault();
  dom.dropzone.classList.add("is-dragover");
}

function onDragLeave(event) {
  if (!dom.dropzone.contains(event.relatedTarget)) {
    dom.dropzone.classList.remove("is-dragover");
  }
}

async function onDrop(event) {
  event.preventDefault();
  dom.dropzone.classList.remove("is-dragover");
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) {
    handleSelectedFile(file);
  }
}

function onSearchInput(event) {
  state.searchQuery = event.target.value.trim().toLowerCase();
  syncSelectedControl();
  renderControlsAndDetail();
}

function onStatusFilterClick(event) {
  const button = event.target.closest("button[data-status]");
  if (!button) {
    return;
  }

  state.activeStatusFilter = button.dataset.status;
  syncSelectedControl();
  renderControlsAndDetail();
}

function onHighRiskToggle(event) {
  state.highRiskOnly = event.target.checked;
  syncSelectedControl();
  renderControlsAndDetail();
}

function onControlsListClick(event) {
  const button = event.target.closest("[data-control-id]");
  if (!button) {
    return;
  }

  state.selectedControlId = button.dataset.controlId;
  renderControlsAndDetail();
}

function onDetailViewClick(event) {
  const verdictButton = event.target.closest("[data-review-verdict]");
  if (verdictButton) {
    handleVerdictSelection(verdictButton.dataset.controlId, verdictButton.dataset.reviewVerdict);
    return;
  }

  const retryButton = event.target.closest("[data-review-retry]");
  if (retryButton) {
    persistControlReview(retryButton.dataset.reviewRetry);
  }
}

function onDetailViewInput(event) {
  const remarksField = event.target.closest("[data-review-remarks]");
  if (!remarksField) {
    return;
  }

  const controlId = remarksField.dataset.reviewRemarks;
  const controlReview = ensureControlReviewEntry(controlId);
  controlReview.remarks = remarksField.value;
  setControlSaveState(controlId, "dirty");
  syncRenderedReviewSaveState(controlId);
  scheduleControlReviewSave(controlId);
}

function onSavedReviewsListClick(event) {
  const button = event.target.closest("[data-review-open]");
  if (!button) {
    return;
  }

  loadSavedReview(button.dataset.reviewOpen);
}

function onLibraryDeletePanelClick(event) {
  const confirmButton = event.target.closest("[data-delete-all-confirm]");
  if (confirmButton) {
    deleteAllSavedReviews();
    return;
  }

  const cancelButton = event.target.closest("[data-delete-all-cancel]");
  if (cancelButton) {
    closeDeleteAllPanel();
  }
}

function onLibraryDeletePanelInput(event) {
  const passwordInput = event.target.closest("[data-delete-all-password]");
  if (!passwordInput) {
    return;
  }

  state.deleteAllPassword = passwordInput.value;
  if (state.deleteAllError) {
    state.deleteAllError = null;
    renderLibraryModal();
  }
}

function onTreeSearchInput(event) {
  state.treeSearchQuery = event.target.value.trim().toLowerCase();
  renderTreeModal();
}

function onTreeContentClick(event) {
  const toggle = event.target.closest("[data-tree-toggle]");
  if (!toggle) {
    return;
  }

  const path = toggle.dataset.treeToggle;
  if (state.expandedTreePaths.has(path)) {
    state.expandedTreePaths.delete(path);
  } else {
    state.expandedTreePaths.add(path);
  }
  renderTreeModal();
}

function onDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (state.libraryOpen) {
    if (state.deleteAllOpen) {
      closeDeleteAllPanel();
      return;
    }
    closeLibraryModal();
    return;
  }

  if (state.treeModalOpen) {
    closeTreeModal();
  }
}

function resetFilters() {
  resetFilterState();
  renderFilters();
  syncSelectedControl();
  renderControlsAndDetail();
}

function resetFilterState() {
  state.activeStatusFilter = "all";
  state.highRiskOnly = false;
  state.searchQuery = "";
}

function clearViewer() {
  clearCurrentResults();
  state.selectedFile = null;
  state.uploadStatus = "idle";
  state.uploadError = null;
  state.feedback = null;
  state.libraryOpen = false;
  resetDeleteAllState();
  resetFilterState();
  dom.fileInput.value = "";
  dom.searchInput.value = "";
  dom.highRiskToggle.checked = false;
  dom.treeSearchInput.value = "";
  render();
}

function handleSelectedFile(file) {
  try {
    validateSelectedPdf(file);
    state.selectedFile = file;
    state.uploadStatus = "ready";
    state.uploadError = null;
    setFeedback(`${file.name} is ready for analysis and local saving.`, "success");
    render();
  } catch (error) {
    state.selectedFile = null;
    state.uploadStatus = "error";
    state.uploadError = getErrorMessage(error);
    setFeedback(state.uploadError, "error");
    render();
  }
}

async function analyzeSelectedFile() {
  if (!state.selectedFile) {
    const message = "Choose a PDF before starting the contract analysis.";
    state.uploadStatus = "error";
    state.uploadError = message;
    setFeedback(message, "error");
    render();
    return;
  }

  try {
    validateSelectedPdf(state.selectedFile);

    clearCurrentResults();
    resetFilterState();
    state.uploadStatus = "uploading";
    state.uploadError = null;
    dom.searchInput.value = "";
    dom.highRiskToggle.checked = false;
    dom.treeSearchInput.value = "";
    setFeedback(
      `Analyzing ${state.selectedFile.name}. The result will be saved locally for later review.`,
      "success"
    );
    render();

    const formData = new FormData();
    formData.append("file", state.selectedFile);

    const payload = await requestJson("/api/reviews", {
      method: "POST",
      body: formData
    });

    validateSavedReviewRecord(payload);
    applyReviewRecord(payload, { keepSelectedFile: true });
    state.uploadStatus = "success";
    state.uploadError = null;
    setFeedback(`Analysis complete. Saved review ${payload.review_id} for ${payload.source.file_name}.`, "success");
    render();
    fetchSavedReviews({ silent: true });
  } catch (error) {
    state.uploadStatus = "error";
    state.uploadError = getErrorMessage(error);
    setFeedback(state.uploadError, "error");
    render();
  }
}

async function loadSavedReview(reviewId) {
  try {
    const payload = await requestJson(`/api/reviews/${encodeURIComponent(reviewId)}`);
    validateSavedReviewRecord(payload);

    clearCurrentResults();
    resetFilterState();
    state.selectedFile = null;
    state.uploadStatus = "success";
    state.uploadError = null;
    applyReviewRecord(payload);
    setFeedback(`Loaded saved review ${payload.review_id} for ${payload.source.file_name}.`, "success");
    closeLibraryModal({ keepFocus: false });
    render();
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
    render();
  }
}

async function fetchSavedReviews({ silent = false } = {}) {
  if (!silent) {
    state.savedReviewsStatus = "loading";
    state.savedReviewsError = null;
    renderLibraryButton();
    renderLibraryModal();
  } else if (!state.savedReviews.length) {
    state.savedReviewsStatus = "loading";
  }

  try {
    const payload = await requestJson("/api/reviews");
    const reviews = normalizeReviewSummaries(payload);
    state.savedReviews = reviews;
    state.savedReviewsStatus = "success";
    state.savedReviewsError = null;
  } catch (error) {
    state.savedReviewsStatus = "error";
    state.savedReviewsError = getErrorMessage(error);
  }

  renderLibraryButton();
  renderLibraryModal();
}

async function deleteAllSavedReviews() {
  if (state.deleteAllStatus === "loading") {
    return;
  }

  state.deleteAllStatus = "loading";
  state.deleteAllError = null;
  renderLibraryModal();

  try {
    const payload = await requestJson("/api/reviews", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: state.deleteAllPassword
      })
    });

    const deletedCount = toInteger(payload && payload.deleted_count, 0);
    const deletedFileCount = toInteger(payload && payload.deleted_file_count, 0);

    state.savedReviews = [];
    state.savedReviewsStatus = "success";
    state.savedReviewsError = null;
    resetDeleteAllState();

    if (state.activeReviewId) {
      clearCurrentResults();
      state.uploadStatus = state.selectedFile ? "ready" : "idle";
      state.uploadError = null;
    }

    setFeedback(
      `Deleted ${deletedCount} saved review${deletedCount === 1 ? "" : "s"} and ${deletedFileCount} stored PDF${deletedFileCount === 1 ? "" : "s"} from local storage.`,
      "success"
    );
    render();
    fetchSavedReviews({ silent: true });
  } catch (error) {
    state.deleteAllStatus = "error";
    state.deleteAllError = getErrorMessage(error);
    renderLibraryModal();
  }
}

function applyReviewRecord(reviewRecord, { keepSelectedFile = false } = {}) {
  const normalized = normalizeContractResponse(reviewRecord.analysis, reviewRecord.source.file_name);

  state.rawData = reviewRecord.analysis;
  state.normalizedData = normalized;
  state.activeReviewId = reviewRecord.review_id;
  state.activeReviewMeta = {
    review_id: reviewRecord.review_id,
    created_at: normalizeTimestamp(reviewRecord.created_at) || new Date().toISOString(),
    updated_at: normalizeTimestamp(reviewRecord.updated_at) || normalizeTimestamp(reviewRecord.created_at),
    source: reviewRecord.source
  };
  state.controlReviews = normalizeControlReviews(reviewRecord.control_reviews, normalized.controls);
  state.controlSaveStates = {};
  state.controlSaveTokens = {};
  state.selectedControlId = getDefaultControlId(normalized);
  state.treeModalOpen = false;
  state.treeSearchQuery = "";
  state.expandedTreePaths = new Set(["root"]);
  clearAllRemarkTimers();

  if (!keepSelectedFile) {
    state.selectedFile = null;
  }
}

function clearCurrentResults() {
  state.rawData = null;
  state.normalizedData = null;
  state.activeReviewId = null;
  state.activeReviewMeta = null;
  state.selectedControlId = null;
  state.controlReviews = {};
  state.controlSaveStates = {};
  state.controlSaveTokens = {};
  state.treeModalOpen = false;
  state.treeSearchQuery = "";
  state.expandedTreePaths = new Set(["root"]);
  clearAllRemarkTimers();
}

function clearAllRemarkTimers() {
  Object.values(state.controlRemarkTimers).forEach((timerId) => {
    window.clearTimeout(timerId);
  });
  state.controlRemarkTimers = {};
}

function openDeleteAllPanel() {
  if (!state.savedReviews.length || state.deleteAllStatus === "loading") {
    return;
  }

  state.deleteAllOpen = true;
  state.deleteAllStatus = "idle";
  state.deleteAllError = null;
  renderLibraryModal();
  window.setTimeout(() => {
    const passwordInput = document.getElementById("deleteAllPasswordInput");
    if (passwordInput) {
      passwordInput.focus();
    }
  }, 0);
}

function closeDeleteAllPanel() {
  resetDeleteAllState();
  renderLibraryModal();
}

function resetDeleteAllState() {
  state.deleteAllOpen = false;
  state.deleteAllPassword = "";
  state.deleteAllStatus = "idle";
  state.deleteAllError = null;
}

function openTreeModal() {
  if (!state.rawData) {
    return;
  }

  state.libraryOpen = false;
  state.treeModalOpen = true;
  renderTreeModal();
  renderLibraryModal();
  window.setTimeout(() => {
    dom.treeSearchInput.focus();
  }, 0);
}

function closeTreeModal({ keepFocus = true } = {}) {
  if (!state.treeModalOpen) {
    return;
  }

  state.treeModalOpen = false;
  renderTreeModal();
  if (keepFocus) {
    dom.viewTreeButton.focus();
  }
}

function openLibraryModal() {
  state.treeModalOpen = false;
  state.libraryOpen = true;
  renderTreeModal();
  renderLibraryModal();

  if (state.savedReviewsStatus === "idle") {
    fetchSavedReviews();
  }
}

function closeLibraryModal({ keepFocus = true } = {}) {
  if (!state.libraryOpen) {
    return;
  }

  state.libraryOpen = false;
  resetDeleteAllState();
  renderLibraryModal();
  if (keepFocus) {
    dom.savedReviewsButton.focus();
  }
}

function expandAllTreeNodes() {
  if (!state.rawData) {
    return;
  }

  state.expandedTreePaths = collectContainerPaths(state.rawData);
  renderTreeModal();
}

function collapseAllTreeNodes() {
  state.expandedTreePaths = new Set(["root"]);
  renderTreeModal();
}

function setFeedback(message, type) {
  state.feedback = { message, type };
}

function getErrorMessage(error) {
  if (error instanceof SyntaxError) {
    return "The app received invalid JSON from the server. Check the API response and try again.";
  }
  return error && error.message
    ? error.message
    : "The contract review request could not be completed. Try again in a moment.";
}

function createApiError(payload, status) {
  const message =
    (payload && (payload.message || payload.detail)) ||
    `The request failed with status ${status}.`;
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  let payload = null;

  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `The server returned a non-JSON response${text ? `: ${truncate(text, 180)}` : "."}`
      );
    }
    throw new Error("The server returned an unexpected non-JSON response.");
  }

  if (!response.ok) {
    throw createApiError(payload, response.status);
  }

  return payload;
}

function validateSelectedPdf(file) {
  if (!file) {
    throw new Error("Choose a PDF before starting the contract analysis.");
  }

  const fileName = String(file.name || "").toLowerCase();
  const mimeType = String(file.type || "").toLowerCase();
  if (!fileName.endsWith(".pdf") && mimeType !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }
}

function validateContractResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The contract response root must be an object.");
  }

  if (!Array.isArray(data.controls)) {
    throw new Error("The contract response is missing a valid controls array.");
  }

  data.controls.forEach((control, index) => {
    if (!control || typeof control !== "object" || Array.isArray(control)) {
      throw new Error(`Control ${index + 1} must be an object.`);
    }

    const requiredFields = ["control_id", "title", "status", "confidence", "reason"];
    requiredFields.forEach((fieldName) => {
      if (control[fieldName] === undefined || control[fieldName] === null || control[fieldName] === "") {
        throw new Error(`Control ${index + 1} is missing required field "${fieldName}".`);
      }
    });
  });
}

function validateSavedReviewRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("The saved review payload must be an object.");
  }

  if (!asNonEmptyString(record.review_id)) {
    throw new Error("The saved review payload is missing a valid review_id.");
  }

  if (!record.analysis || typeof record.analysis !== "object" || Array.isArray(record.analysis)) {
    throw new Error("The saved review payload is missing the analysis object.");
  }

  validateContractResponse(record.analysis);
}

function normalizeReviewSummaries(payload) {
  const reviews = payload && Array.isArray(payload.reviews) ? payload.reviews : [];
  return reviews
    .map((review) => normalizeReviewSummary(review))
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}

function normalizeReviewSummary(review) {
  const totalControls = toInteger(review && review.total_controls, 0);
  const verdictCounts = review && review.verdict_counts && typeof review.verdict_counts === "object"
    ? review.verdict_counts
    : {};
  const fileName = asNonEmptyString(review && review.file_name) || "Saved contract review";

  return {
    review_id: asNonEmptyString(review && review.review_id) || "Unavailable",
    file_name: fileName,
    request_id: asNullableString(review && review.request_id),
    download_available: Boolean(review && review.download_available),
    download_name: asNonEmptyString(review && review.download_name) || fileName,
    risk_level: normalizeRiskLevel(review && review.risk_level),
    created_at: normalizeTimestamp(review && review.created_at),
    updated_at: normalizeTimestamp(review && review.updated_at),
    total_controls: totalControls,
    verdict_counts: {
      reviewed: toInteger(verdictCounts.reviewed, 0),
      correct: toInteger(verdictCounts.correct, 0),
      incorrect: toInteger(verdictCounts.incorrect, 0),
      unreviewed: toInteger(verdictCounts.unreviewed, totalControls)
    }
  };
}

function normalizeContractResponse(data, uploadedFileName) {
  const controls = data.controls.map((control, index) => normalizeControl(control, index));
  const computedCounts = countControls(controls);
  const highRiskIds = asStringArray(data.summary && data.summary.high_risk_controls);
  const highRiskSet = new Set(highRiskIds);

  controls.forEach((control) => {
    control.isHighRisk = highRiskSet.has(control.control_id);
  });

  return {
    request_id: asNonEmptyString(data.request_id) || "Unavailable",
    uploaded_file_name: uploadedFileName || "Uploaded response",
    document_meta: {
      file_name: asNonEmptyString(data.document_meta && data.document_meta.file_name) || "Unknown document",
      file_type: asNonEmptyString(data.document_meta && data.document_meta.file_type) || "Unknown",
      pages: toInteger(data.document_meta && data.document_meta.pages),
      text_extraction_mode:
        asNonEmptyString(data.document_meta && data.document_meta.text_extraction_mode) || "Unknown",
      ocr_used: Boolean(data.document_meta && data.document_meta.ocr_used)
    },
    extraction_meta: {
      segments_created: toInteger(data.extraction_meta && data.extraction_meta.segments_created),
      annexures_detected: toInteger(data.extraction_meta && data.extraction_meta.annexures_detected),
      confidence: normalizeConfidence(data.extraction_meta && data.extraction_meta.confidence),
      selected_controls: asStringArray(data.extraction_meta && data.extraction_meta.selected_controls),
      processing_time_ms: toNumberOrNull(data.extraction_meta && data.extraction_meta.processing_time_ms),
      llm_used: Boolean(data.extraction_meta && data.extraction_meta.llm_used),
      analysis_version: asNonEmptyString(data.extraction_meta && data.extraction_meta.analysis_version) || "Unknown"
    },
    summary: {
      controls_complete: toInteger(data.summary && data.summary.controls_complete, computedCounts.complete),
      controls_partial: toInteger(data.summary && data.summary.controls_partial, computedCounts.partial),
      controls_missing: toInteger(data.summary && data.summary.controls_missing, computedCounts.missing),
      high_risk_controls: highRiskIds
    },
    controls,
    overall_assessment: {
      risk_level: normalizeRiskLevel(data.overall_assessment && data.overall_assessment.risk_level),
      key_gaps: asStringArray(data.overall_assessment && data.overall_assessment.key_gaps),
      recommended_next_actions: asStringArray(
        data.overall_assessment && data.overall_assessment.recommended_next_actions
      )
    }
  };
}

function normalizeControl(control, index) {
  const controlId = asNonEmptyString(control.control_id) || `control_${index + 1}`;
  const title = asNonEmptyString(control.title) || humanizeId(controlId);
  const status = normalizeStatus(control.status);

  const normalized = {
    control_id: controlId,
    title,
    status,
    confidence: normalizeConfidence(control.confidence),
    found_elements: asStringArray(control.found_elements),
    missing_elements: asStringArray(control.missing_elements),
    matched_clauses: asStringArray(control.matched_clauses),
    evidence_snippets: asStringArray(control.evidence_snippets),
    red_flags: asStringArray(control.red_flags),
    contradictions: asStringArray(control.contradictions),
    reason: asNonEmptyString(control.reason) || "No review reasoning provided.",
    operational_impact: asNullableString(control.operational_impact),
    recommended_fix_summary: asNullableString(control.recommended_fix_summary),
    banking_regulatory_relevance: asNullableString(control.banking_regulatory_relevance),
    isHighRisk: false
  };

  normalized.gapCount =
    normalized.missing_elements.length + normalized.red_flags.length + normalized.contradictions.length;
  normalized.searchIndex = buildSearchIndex(normalized);
  return normalized;
}

function normalizeControlReviews(controlReviews, controls) {
  const source =
    controlReviews && typeof controlReviews === "object" && !Array.isArray(controlReviews)
      ? controlReviews
      : {};
  const normalized = {};

  controls.forEach((control) => {
    const controlId = control.control_id;
    normalized[controlId] = normalizeSingleControlReview(source[controlId]);
  });

  return normalized;
}

function normalizeSingleControlReview(review) {
  const verdict = normalizeVerdictValue(review && review.verdict);
  return {
    verdict,
    remarks: typeof (review && review.remarks) === "string" ? review.remarks : "",
    reviewed_at: verdict === "unreviewed" ? null : normalizeTimestamp(review && review.reviewed_at)
  };
}

function normalizeVerdictValue(value) {
  const verdict = String(value || "").trim().toLowerCase();
  if (verdict === "correct" || verdict === "incorrect" || verdict === "unreviewed") {
    return verdict;
  }
  return "unreviewed";
}

function buildSearchIndex(control) {
  return [
    control.title,
    control.reason,
    control.control_id,
    ...control.found_elements,
    ...control.missing_elements,
    ...control.red_flags,
    ...control.contradictions,
    ...control.evidence_snippets,
    ...control.matched_clauses
  ]
    .join(" ")
    .toLowerCase();
}

function getDefaultControlId(data) {
  const highRiskControl = data.controls.find((control) => control.isHighRisk);
  return highRiskControl ? highRiskControl.control_id : (data.controls[0] && data.controls[0].control_id) || null;
}

function getFilteredControls() {
  if (!state.normalizedData) {
    return [];
  }

  return state.normalizedData.controls.filter((control) => {
    const matchesStatus =
      state.activeStatusFilter === "all" || control.status === state.activeStatusFilter;
    const matchesRisk = !state.highRiskOnly || control.isHighRisk;
    const matchesSearch = !state.searchQuery || control.searchIndex.includes(state.searchQuery);
    return matchesStatus && matchesRisk && matchesSearch;
  });
}

function syncSelectedControl() {
  const filteredControls = getFilteredControls();
  const stillVisible = filteredControls.some((control) => control.control_id === state.selectedControlId);

  if (stillVisible) {
    return;
  }

  state.selectedControlId = filteredControls[0] ? filteredControls[0].control_id : null;
}

function render() {
  renderUploadState();
  renderFeedback();
  renderLibraryButton();

  const hasData = Boolean(state.normalizedData);
  dom.overviewCard.hidden = !hasData;
  dom.statsCard.hidden = !hasData;
  dom.filtersCard.hidden = !hasData;
  dom.controlsCard.hidden = !hasData;
  dom.assessmentCard.hidden = !hasData;
  dom.clearButton.hidden = !state.selectedFile && !hasData;
  dom.viewTreeButton.hidden = !hasData;

  if (!hasData) {
    dom.detailView.hidden = true;
    dom.detailEmpty.hidden = false;
    dom.detailEmpty.innerHTML = defaultEmptyMarkup;
    dom.detailReviewCard.innerHTML = "";
    renderTreeModal();
    renderLibraryModal();
    syncModalBodyState();
    return;
  }

  renderOverview();
  renderStats();
  renderAssessment();
  renderFilters();
  syncSelectedControl();
  renderControlsAndDetail();
  renderTreeModal();
  renderLibraryModal();
  syncModalBodyState();
}

function renderUploadState() {
  const hasFile = Boolean(state.selectedFile);
  const status = state.uploadStatus;
  const markElement = dom.selectedFileState.querySelector(".selected-file-mark");

  dom.uploadButton.disabled = status === "uploading";
  dom.analyzeButton.disabled = !hasFile || status === "uploading";
  dom.analyzeButton.textContent = status === "uploading" ? "Analyzing..." : "Analyze Contract";

  dom.selectedFileState.className = "selected-file-state";

  if (status === "ready" && hasFile) {
    dom.selectedFileState.classList.add("is-ready");
    markElement.textContent = "Ready";
    dom.selectedFileName.textContent = state.selectedFile.name;
    dom.selectedFileHint.textContent =
      "Click Analyze Contract to upload the PDF, save the response locally, and start reviewing controls.";
    return;
  }

  if (status === "uploading" && hasFile) {
    dom.selectedFileState.classList.add("is-uploading");
    markElement.textContent = "Uploading";
    dom.selectedFileName.textContent = state.selectedFile.name;
    dom.selectedFileHint.textContent =
      "The PDF is being sent to the clause-review API. A saved review record will be created when the response is ready.";
    return;
  }

  if (status === "success" && hasFile) {
    dom.selectedFileState.classList.add("is-success");
    markElement.textContent = "Saved";
    dom.selectedFileName.textContent = state.selectedFile.name;
    dom.selectedFileHint.textContent =
      "The analysis was saved locally. You can continue reviewing controls now or reopen this review later from Saved Reviews.";
    return;
  }

  if (!hasFile && state.activeReviewId && state.normalizedData) {
    dom.selectedFileState.classList.add("is-success");
    markElement.textContent = "Library";
    dom.selectedFileName.textContent = state.normalizedData.document_meta.file_name;
    dom.selectedFileHint.textContent = `Loaded saved review ${state.activeReviewId} from local storage.`;
    return;
  }

  if (status === "error") {
    dom.selectedFileState.classList.add("is-error");
    markElement.textContent = "Error";
    dom.selectedFileName.textContent = hasFile ? state.selectedFile.name : "Choose a PDF to begin";
    dom.selectedFileHint.textContent =
      state.uploadError || "The PDF could not be analyzed. Choose a valid file and try again.";
    return;
  }

  markElement.textContent = "No file selected";
  dom.selectedFileName.textContent = "Choose a PDF to begin";
  dom.selectedFileHint.textContent =
    "The app will upload the file to the contract-review API, save the response locally, and let you reopen the review later.";
}

function renderFeedback() {
  if (!state.feedback) {
    dom.feedback.hidden = true;
    dom.feedback.textContent = "";
    dom.feedback.className = "feedback";
    return;
  }

  dom.feedback.hidden = false;
  dom.feedback.textContent = state.feedback.message;
  dom.feedback.className = `feedback ${state.feedback.type === "error" ? "is-error" : "is-success"}`;
}

function renderLibraryButton() {
  if (state.savedReviewsStatus === "loading" && !state.savedReviews.length) {
    dom.savedReviewsButton.textContent = "Saved Reviews...";
    return;
  }

  dom.savedReviewsButton.textContent = state.savedReviews.length
    ? `Saved Reviews (${state.savedReviews.length})`
    : "Saved Reviews";
}

function renderOverview() {
  const data = state.normalizedData;
  const reviewId = state.activeReviewId || "Unavailable";

  const highlightItems = [
    ["Review", reviewId],
    ["Request", data.request_id],
    ["Document", data.document_meta.file_name],
    ["Analysis", data.extraction_meta.analysis_version]
  ];

  const metaItems = [
    ["Uploaded file", data.uploaded_file_name],
    ["File type", data.document_meta.file_type.toUpperCase()],
    ["Pages", data.document_meta.pages !== null ? String(data.document_meta.pages) : "Unavailable"],
    ["Processing time", formatDuration(data.extraction_meta.processing_time_ms)],
    ["Extraction confidence", formatPercent(data.extraction_meta.confidence)],
    ["Segments created", formatNumber(data.extraction_meta.segments_created)],
    ["OCR used", data.document_meta.ocr_used ? "Yes" : "No"],
    ["LLM used", data.extraction_meta.llm_used ? "Yes" : "No"],
    ["Created", formatDateTime(state.activeReviewMeta && state.activeReviewMeta.created_at)],
    ["Updated", formatDateTime(state.activeReviewMeta && state.activeReviewMeta.updated_at)]
  ];

  dom.overviewHighlights.innerHTML = highlightItems
    .map(
      ([label, value]) => `
        <div class="info-chip">
          <span class="info-chip-label">${escapeHtml(label)}</span>
          <span class="info-chip-value">${escapeHtml(value)}</span>
        </div>
      `
    )
    .join("");

  dom.overviewMeta.innerHTML = metaItems
    .map(
      ([label, value]) => `
        <dl class="meta-item">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </dl>
      `
    )
    .join("");
}

function renderStats() {
  const data = state.normalizedData;
  const reviewProgress = getReviewProgress();
  const cards = [
    {
      label: "Overall risk",
      value: titleCase(data.overall_assessment.risk_level),
      className: `is-risk-${data.overall_assessment.risk_level}`
    },
    { label: "Complete", value: formatNumber(data.summary.controls_complete), className: "" },
    { label: "Partial", value: formatNumber(data.summary.controls_partial), className: "" },
    { label: "Missing", value: formatNumber(data.summary.controls_missing), className: "" },
    { label: "Selected", value: formatNumber(data.extraction_meta.selected_controls.length), className: "" },
    { label: "High risk", value: formatNumber(data.summary.high_risk_controls.length), className: "" },
    { label: "Reviewed", value: formatNumber(reviewProgress.reviewed), className: "" },
    { label: "Correct", value: formatNumber(reviewProgress.correct), className: "" },
    { label: "Incorrect", value: formatNumber(reviewProgress.incorrect), className: "" },
    { label: "Unreviewed", value: formatNumber(reviewProgress.unreviewed), className: "" }
  ];

  dom.statsGrid.innerHTML = cards
    .map(
      (card) => `
        <div class="stat-card ${card.className}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderAssessment() {
  const assessment = state.normalizedData.overall_assessment;
  dom.assessmentSummaryPill.textContent =
    `${titleCase(assessment.risk_level)} risk · ${assessment.key_gaps.length} gaps`;
  dom.keyGapsList.innerHTML = renderBulletList(assessment.key_gaps, "No key gaps provided.");
  dom.actionsList.innerHTML = renderBulletList(
    assessment.recommended_next_actions,
    "No recommended next actions provided."
  );
}

function renderFilters() {
  dom.searchInput.value = state.searchQuery;
  dom.highRiskToggle.checked = state.highRiskOnly;

  const statusButtons = dom.statusFilters.querySelectorAll("button[data-status]");
  statusButtons.forEach((button) => {
    const isActive = button.dataset.status === state.activeStatusFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function renderControlsAndDetail() {
  const filteredControls = getFilteredControls();
  const totalCount = state.normalizedData.controls.length;
  const visibleCount = filteredControls.length;

  dom.controlCountLabel.textContent = `${visibleCount} of ${totalCount} controls visible`;

  if (!visibleCount) {
    dom.controlsList.innerHTML = `
      <div class="empty-inline">
        No controls match the current search and filter settings.
      </div>
    `;

    dom.assessmentCard.hidden = true;
    dom.detailView.hidden = true;
    dom.detailEmpty.hidden = false;
    dom.detailEmpty.innerHTML = `
      <div class="empty-state-mark">Filtered</div>
      <h2>No matching controls</h2>
      <p>Adjust the search query or filters to restore visible controls for detailed review.</p>
    `;
    return;
  }

  dom.detailEmpty.innerHTML = defaultEmptyMarkup;

  dom.controlsList.innerHTML = filteredControls
    .map((control) => {
      const controlReview = getControlReview(control.control_id);
      const verdictBadge = createVerdictBadgeMarkup(controlReview.verdict);
      const badges = [
        createBadgeMarkup(control.status, titleCase(control.status)),
        control.isHighRisk ? createBadgeMarkup("high-risk", "High risk") : "",
        verdictBadge
      ]
        .filter(Boolean)
        .join("");

      return `
        <button
          class="control-card ${control.control_id === state.selectedControlId ? "is-selected" : ""}"
          type="button"
          data-control-id="${escapeAttribute(control.control_id)}"
          aria-pressed="${control.control_id === state.selectedControlId ? "true" : "false"}"
        >
          <div class="control-card-head">
            <div>
              <h3>${escapeHtml(control.title)}</h3>
            </div>
            <div class="detail-badges">${badges}</div>
          </div>

          <div class="control-meta">
            <span>Confidence ${escapeHtml(formatPercent(control.confidence))}</span>
            <span>Gap markers ${escapeHtml(String(control.gapCount))}</span>
            <span>Evidence ${escapeHtml(String(control.evidence_snippets.length))}</span>
            <span>Review ${escapeHtml(titleCase(controlReview.verdict))}</span>
          </div>

          <p class="control-preview">${escapeHtml(truncate(control.reason, 165))}</p>
        </button>
      `;
    })
    .join("");

  const selectedControl =
    filteredControls.find((control) => control.control_id === state.selectedControlId) || filteredControls[0];
  state.selectedControlId = selectedControl.control_id;
  renderDetail(selectedControl);
}

function renderDetail(control) {
  dom.detailEmpty.hidden = true;
  dom.detailView.hidden = false;
  dom.assessmentCard.hidden = false;

  const controlReview = getControlReview(control.control_id);

  dom.detailBadges.innerHTML = [
    createBadgeMarkup(control.status, titleCase(control.status)),
    control.isHighRisk ? createBadgeMarkup("high-risk", "High risk") : "",
    createVerdictBadgeMarkup(controlReview.verdict),
    createBadgeMarkup("neutral", humanizeId(control.control_id))
  ]
    .filter(Boolean)
    .join("");

  dom.detailTitle.textContent = control.title;
  dom.detailReason.textContent = control.reason;

  const detailMetrics = [
    ["Confidence", formatPercent(control.confidence)],
    ["Found", String(control.found_elements.length)],
    ["Missing", String(control.missing_elements.length)],
    ["Evidence", String(control.evidence_snippets.length)],
    ["Clauses", String(control.matched_clauses.length)]
  ];

  dom.detailMetrics.innerHTML = detailMetrics
    .map(
      ([label, value]) => `
        <div class="detail-metric">
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </div>
      `
    )
    .join("");

  dom.detailReviewCard.innerHTML = renderReviewCard(control);

  const insightItems = [
    control.operational_impact
      ? `<div class="detail-insight"><strong>Operational impact</strong><span>${escapeHtml(
          truncate(control.operational_impact, 170)
        )}</span></div>`
      : "",
    control.recommended_fix_summary
      ? `<div class="detail-insight"><strong>Recommended fix</strong><span>${escapeHtml(
          truncate(control.recommended_fix_summary, 170)
        )}</span></div>`
      : "",
    control.banking_regulatory_relevance
      ? `<div class="detail-insight"><strong>Regulatory relevance</strong><span>${escapeHtml(
          truncate(control.banking_regulatory_relevance, 170)
        )}</span></div>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  dom.detailInsights.innerHTML = insightItems;
  dom.detailInsights.hidden = !insightItems;

  const sectionMarkup = [
    renderPillSection("Found elements", control.found_elements, ""),
    renderPillSection("Missing elements", control.missing_elements, "is-warning"),
    renderPillSection("Red flags", control.red_flags, "is-danger"),
    renderPillSection("Contradictions", control.contradictions, "is-danger"),
    renderTextCardSection("Matched clauses", control.matched_clauses, true),
    renderTextCardSection("Evidence snippets", control.evidence_snippets, false),
    control.recommended_fix_summary
      ? renderSingleTextSection("Recommended fix summary", control.recommended_fix_summary)
      : "",
    control.operational_impact
      ? renderSingleTextSection("Operational impact", control.operational_impact)
      : "",
    control.banking_regulatory_relevance
      ? renderSingleTextSection("Banking regulatory relevance", control.banking_regulatory_relevance)
      : ""
  ]
    .filter(Boolean)
    .join("");

  dom.detailSections.innerHTML = sectionMarkup;
}

function renderReviewCard(control) {
  const controlReview = getControlReview(control.control_id);
  const saveState = getControlSaveState(control.control_id);
  const saveStatePresentation = getReviewSavePresentation(saveState.status);

  return `
    <section class="review-card">
      <div class="review-card-head">
        <div>
          <p class="section-kicker">Reviewer</p>
          <h3>Review verdict and remarks</h3>
        </div>
        <span
          id="reviewSaveState"
          class="review-save-state ${saveStatePresentation.className}"
          data-control-id="${escapeAttribute(control.control_id)}"
        >
          ${escapeHtml(saveStatePresentation.label)}
        </span>
      </div>

      <div class="verdict-group" role="group" aria-label="Reviewer verdict">
        ${VERDICT_OPTIONS.map((option) => renderVerdictButton(control.control_id, option, controlReview.verdict)).join("")}
      </div>

      <label class="field">
        <span class="field-label">Remarks</span>
        <textarea
          id="reviewRemarks"
          class="textarea"
          data-review-remarks="${escapeAttribute(control.control_id)}"
          placeholder="Add review remarks for why this control is correct or incorrect."
        >${escapeHtml(controlReview.remarks)}</textarea>
      </label>

      <div class="review-meta">
        <span id="reviewReviewedAt" data-control-id="${escapeAttribute(control.control_id)}">
          ${escapeHtml(buildReviewedAtLabel(controlReview))}
        </span>
        <button
          id="reviewRetryButton"
          class="text-button"
          type="button"
          data-control-id="${escapeAttribute(control.control_id)}"
          data-review-retry="${escapeAttribute(control.control_id)}"
          ${saveState.status === "error" ? "" : "hidden"}
        >
          Retry save
        </button>
      </div>
    </section>
  `;
}

function renderVerdictButton(controlId, option, selectedVerdict) {
  const isActive = option.value === selectedVerdict;
  return `
    <button
      class="verdict-chip ${isActive ? "is-active" : ""}"
      type="button"
      data-control-id="${escapeAttribute(controlId)}"
      data-review-verdict="${escapeAttribute(option.value)}"
      data-verdict="${escapeAttribute(option.value)}"
      aria-pressed="${isActive ? "true" : "false"}"
    >
      ${escapeHtml(option.label)}
    </button>
  `;
}

function renderLibraryModal() {
  const shouldShow = state.libraryOpen;
  dom.libraryModal.hidden = !shouldShow;
  dom.libraryModal.setAttribute("aria-hidden", shouldShow ? "false" : "true");

  if (!shouldShow) {
    dom.libraryStatusText.textContent = "";
    dom.libraryDeletePanel.hidden = true;
    dom.libraryDeletePanel.innerHTML = "";
    dom.savedReviewsList.innerHTML = "";
    syncModalBodyState();
    return;
  }

  const deleteDisabled =
    state.deleteAllStatus === "loading" ||
    state.savedReviewsStatus === "loading" ||
    state.savedReviews.length === 0;
  dom.libraryDeleteButton.disabled = deleteDisabled;
  dom.libraryDeleteButton.textContent = state.deleteAllStatus === "loading" ? "Deleting..." : "Delete All";
  dom.libraryStatusText.textContent = getLibraryStatusText();
  renderLibraryDeletePanel();
  dom.savedReviewsList.innerHTML = renderSavedReviewsList();
  syncModalBodyState();
}

function renderLibraryDeletePanel() {
  if (!state.deleteAllOpen) {
    dom.libraryDeletePanel.hidden = true;
    dom.libraryDeletePanel.innerHTML = "";
    return;
  }

  const inlineMessage = state.deleteAllError
    ? `<div class="library-inline-status is-error">${escapeHtml(state.deleteAllError)}</div>`
    : "";

  dom.libraryDeletePanel.hidden = false;
  dom.libraryDeletePanel.innerHTML = `
    <p class="library-delete-warning">
      This will permanently remove every saved review and stored uploaded PDF from local storage. This action cannot be undone.
    </p>

    <label class="field">
      <span class="field-label">Password</span>
      <input
        id="deleteAllPasswordInput"
        class="input"
        type="password"
        autocomplete="current-password"
        data-delete-all-password
        value="${escapeAttribute(state.deleteAllPassword)}"
        placeholder="Enter password"
      >
    </label>

    ${inlineMessage}

    <div class="library-delete-actions">
      <button
        class="button button-secondary"
        type="button"
        data-delete-all-cancel
        ${state.deleteAllStatus === "loading" ? "disabled" : ""}
      >
        Cancel
      </button>
      <button
        class="button button-danger"
        type="button"
        data-delete-all-confirm
        ${state.deleteAllStatus === "loading" ? "disabled" : ""}
      >
        ${state.deleteAllStatus === "loading" ? "Deleting..." : "Delete All"}
      </button>
    </div>
  `;
}

function getLibraryStatusText() {
  if (state.savedReviewsStatus === "loading" && !state.savedReviews.length) {
    return "Loading saved reviews from local storage...";
  }

  if (state.savedReviewsStatus === "error") {
    return state.savedReviewsError || "Saved reviews could not be loaded.";
  }

  if (!state.savedReviews.length) {
    return "No saved reviews yet. Analyze a PDF to create the first local review record.";
  }

  return `${state.savedReviews.length} saved review${state.savedReviews.length === 1 ? "" : "s"} available locally.`;
}

function renderSavedReviewsList() {
  if (state.savedReviewsStatus === "loading" && !state.savedReviews.length) {
    return `<div class="empty-inline">Loading saved reviews...</div>`;
  }

  if (!state.savedReviews.length) {
    return `<div class="empty-inline">No saved reviews are available yet.</div>`;
  }

  return state.savedReviews
    .map((review) => {
      const isActive = review.review_id === state.activeReviewId;
      const riskLabel = `${titleCase(review.risk_level)} risk`;
      const reviewProgress = review.verdict_counts;
      const downloadMarkup = review.download_available
        ? `
          <a
            class="button button-secondary saved-review-download"
            href="/api/reviews/${encodeURIComponent(review.review_id)}/file"
            download="${escapeAttribute(review.download_name)}"
          >
            Download PDF
          </a>
        `
        : `<span class="saved-review-unavailable">File unavailable</span>`;

      return `
        <article
          class="saved-review-card ${isActive ? "is-active" : ""}"
        >
          <button
            class="saved-review-open"
            type="button"
            data-review-open="${escapeAttribute(review.review_id)}"
          >
            <div class="saved-review-head">
              <div>
                <h3>${escapeHtml(review.file_name)}</h3>
              </div>
              <div class="detail-badges">
                ${createBadgeMarkup("neutral", riskLabel)}
                ${isActive ? createBadgeMarkup("neutral", "Open") : ""}
              </div>
            </div>

            <div class="saved-review-meta">
              <span>Updated ${escapeHtml(formatDateTime(review.updated_at))}</span>
              <span>Total controls ${escapeHtml(String(review.total_controls))}</span>
              <span>${escapeHtml(review.request_id || "Request unavailable")}</span>
            </div>

            <div class="saved-review-progress">
              <span>Reviewed ${escapeHtml(String(reviewProgress.reviewed))}/${escapeHtml(String(review.total_controls))}</span>
              <span>Correct ${escapeHtml(String(reviewProgress.correct))}</span>
              <span>Incorrect ${escapeHtml(String(reviewProgress.incorrect))}</span>
              <span>Unreviewed ${escapeHtml(String(reviewProgress.unreviewed))}</span>
            </div>
          </button>

          <div class="saved-review-actions">
            ${downloadMarkup}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTreeModal() {
  const hasData = Boolean(state.rawData);
  const shouldShow = hasData && state.treeModalOpen;

  dom.viewTreeButton.hidden = !hasData;
  dom.treeModal.hidden = !shouldShow;
  dom.treeModal.setAttribute("aria-hidden", shouldShow ? "false" : "true");

  if (!shouldShow) {
    dom.treeSearchStatus.textContent = "";
    dom.treeContent.innerHTML = "";
    syncModalBodyState();
    return;
  }

  dom.treeSearchInput.value = state.treeSearchQuery;

  const query = state.treeSearchQuery;
  const searchInfo = query ? findTreeMatches(state.rawData, query) : createEmptyTreeSearchInfo();
  const effectiveExpandedPaths = new Set([
    "root",
    ...Array.from(state.expandedTreePaths),
    ...Array.from(searchInfo.autoExpandedPaths)
  ]);

  if (query) {
    dom.treeSearchStatus.textContent = searchInfo.matchCount
      ? `${searchInfo.matchCount} matching node${searchInfo.matchCount === 1 ? "" : "s"} in the uploaded JSON.`
      : "No matching keys or values in the uploaded JSON.";
  } else {
    dom.treeSearchStatus.textContent =
      "Root is expanded by default. Search, expand, or collapse branches to inspect nested response data.";
  }

  dom.treeContent.innerHTML = `
    <div class="tree-root">
      ${renderTreeNode({
        label: "root",
        value: state.rawData,
        path: "root",
        parentIsArray: false,
        expandedPaths: effectiveExpandedPaths,
        matchedPaths: searchInfo.matchedPaths
      })}
    </div>
  `;
  syncModalBodyState();
}

function syncModalBodyState() {
  document.body.classList.toggle("modal-open", state.treeModalOpen || state.libraryOpen);
}

function renderTreeNode({ label, value, path, parentIsArray, expandedPaths, matchedPaths }) {
  if (isContainer(value)) {
    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((item, index) => [index, item]) : Object.entries(value);
    const hasChildren = entries.length > 0;
    const expanded = path === "root" ? true : expandedPaths.has(path);
    const displayLabel = path === "root" ? "root" : formatTreeLabel(label, parentIsArray);
    const typeLabel = `${isArray ? "Array" : "Object"}(${entries.length})`;
    const childrenMarkup = hasChildren && expanded
      ? `
          <div class="tree-children">
            ${entries
              .map(([childKey, childValue]) =>
                renderTreeNode({
                  label: String(childKey),
                  value: childValue,
                  path: createTreePath(path, childKey, isArray),
                  parentIsArray: isArray,
                  expandedPaths,
                  matchedPaths
                })
              )
              .join("")}
          </div>
        `
      : "";

    return `
      <div class="tree-node ${matchedPaths.has(path) ? "is-match" : ""}">
        <div class="tree-node-line">
          ${path === "root"
            ? `<span class="tree-toggle-spacer"></span>`
            : hasChildren
              ? `<button class="tree-toggle" type="button" data-tree-toggle="${escapeAttribute(path)}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "-" : "+"}</button>`
              : `<span class="tree-toggle-spacer"></span>`}
          <div class="tree-label">
            <span class="tree-key">${escapeHtml(displayLabel)}</span>
            <span class="tree-type">${escapeHtml(typeLabel)}</span>
          </div>
        </div>
        ${childrenMarkup}
      </div>
    `;
  }

  const primitive = formatTreePrimitive(value);
  return `
    <div class="tree-node ${matchedPaths.has(path) ? "is-match" : ""}">
      <div class="tree-node-line">
        <span class="tree-toggle-spacer"></span>
        <div class="tree-label">
          <span class="tree-key">${escapeHtml(path === "root" ? "root" : formatTreeLabel(label, parentIsArray))}</span>
          <span class="tree-value ${primitive.className}">${escapeHtml(primitive.text)}</span>
        </div>
      </div>
    </div>
  `;
}

function handleVerdictSelection(controlId, verdict) {
  if (!state.activeReviewId) {
    return;
  }

  const controlReview = ensureControlReviewEntry(controlId);
  controlReview.verdict = normalizeVerdictValue(verdict);
  controlReview.reviewed_at = controlReview.verdict === "unreviewed" ? null : new Date().toISOString();

  clearRemarkTimer(controlId);
  setControlSaveState(controlId, "saving");
  renderStats();
  renderControlsAndDetail();
  persistControlReview(controlId);
}

function scheduleControlReviewSave(controlId) {
  clearRemarkTimer(controlId);
  state.controlRemarkTimers[controlId] = window.setTimeout(() => {
    persistControlReview(controlId);
  }, REVIEW_SAVE_DELAY_MS);
}

function clearRemarkTimer(controlId) {
  if (!state.controlRemarkTimers[controlId]) {
    return;
  }

  window.clearTimeout(state.controlRemarkTimers[controlId]);
  delete state.controlRemarkTimers[controlId];
}

async function persistControlReview(controlId) {
  if (!state.activeReviewId) {
    return;
  }

  clearRemarkTimer(controlId);
  const controlReview = ensureControlReviewEntry(controlId);
  const saveToken = nextControlSaveToken(controlId);

  setControlSaveState(controlId, "saving");
  syncRenderedReviewSaveState(controlId);

  try {
    const payload = await requestJson(
      `/api/reviews/${encodeURIComponent(state.activeReviewId)}/controls/${encodeURIComponent(controlId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          verdict: controlReview.verdict,
          remarks: controlReview.remarks
        })
      }
    );

    if (!isLatestControlSave(controlId, saveToken)) {
      return;
    }

    state.controlReviews[controlId] = normalizeSingleControlReview(payload.control_review);
    if (state.activeReviewMeta) {
      state.activeReviewMeta.updated_at = normalizeTimestamp(payload.updated_at) || state.activeReviewMeta.updated_at;
    }
    setControlSaveState(controlId, "saved");
    syncRenderedReviewSaveState(controlId);
    fetchSavedReviews({ silent: true });
  } catch (error) {
    if (!isLatestControlSave(controlId, saveToken)) {
      return;
    }

    setControlSaveState(controlId, "error", getErrorMessage(error));
    syncRenderedReviewSaveState(controlId);
  }
}

function nextControlSaveToken(controlId) {
  const nextToken = (state.controlSaveTokens[controlId] || 0) + 1;
  state.controlSaveTokens[controlId] = nextToken;
  return nextToken;
}

function isLatestControlSave(controlId, saveToken) {
  return state.controlSaveTokens[controlId] === saveToken;
}

function setControlSaveState(controlId, status, message = null) {
  state.controlSaveStates[controlId] = { status, message };
}

function getControlSaveState(controlId) {
  return state.controlSaveStates[controlId] || { status: "saved", message: null };
}

function syncRenderedReviewSaveState(controlId) {
  if (state.selectedControlId !== controlId) {
    return;
  }

  const saveStateElement = document.getElementById("reviewSaveState");
  const reviewedAtElement = document.getElementById("reviewReviewedAt");
  const retryButton = document.getElementById("reviewRetryButton");

  if (!saveStateElement || !reviewedAtElement || !retryButton) {
    return;
  }

  const saveState = getControlSaveState(controlId);
  const saveStatePresentation = getReviewSavePresentation(saveState.status);
  const controlReview = getControlReview(controlId);

  saveStateElement.className = `review-save-state ${saveStatePresentation.className}`.trim();
  saveStateElement.textContent = saveStatePresentation.label;
  reviewedAtElement.textContent = buildReviewedAtLabel(controlReview);
  retryButton.hidden = saveState.status !== "error";
  retryButton.dataset.reviewRetry = controlId;
}

function getReviewSavePresentation(status) {
  if (status === "saving") {
    return { label: "Saving...", className: "is-saving" };
  }
  if (status === "error") {
    return { label: "Save failed", className: "is-error" };
  }
  if (status === "dirty") {
    return { label: "Unsaved changes", className: "is-dirty" };
  }
  return { label: "Saved locally", className: "is-saved" };
}

function buildReviewedAtLabel(controlReview) {
  if (!controlReview.reviewed_at) {
    return "No reviewer decision recorded yet.";
  }
  return `Last reviewed ${formatDateTime(controlReview.reviewed_at)}`;
}

function getControlReview(controlId) {
  return state.controlReviews[controlId] || {
    verdict: "unreviewed",
    remarks: "",
    reviewed_at: null
  };
}

function ensureControlReviewEntry(controlId) {
  if (!state.controlReviews[controlId]) {
    state.controlReviews[controlId] = {
      verdict: "unreviewed",
      remarks: "",
      reviewed_at: null
    };
  }
  return state.controlReviews[controlId];
}

function getReviewProgress() {
  if (!state.normalizedData) {
    return { reviewed: 0, correct: 0, incorrect: 0, unreviewed: 0 };
  }

  return state.normalizedData.controls.reduce(
    (counts, control) => {
      const verdict = getControlReview(control.control_id).verdict;

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

function createVerdictBadgeMarkup(verdict) {
  if (verdict === "correct") {
    return createBadgeMarkup("review-correct", "Correct");
  }
  if (verdict === "incorrect") {
    return createBadgeMarkup("review-incorrect", "Incorrect");
  }
  return "";
}

function renderPillSection(title, items, toneClass) {
  if (!items.length) {
    return "";
  }

  const pills = items
    .map((item) => `<div class="pill-item ${toneClass}">${escapeHtml(item)}</div>`)
    .join("");

  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)} <span class="section-pill">${items.length}</span></h3>
      <div class="pill-list">${pills}</div>
    </section>
  `;
}

function renderTextCardSection(title, items, preserveWhitespace) {
  if (!items.length) {
    return "";
  }

  const cards = items
    .map((item) => {
      const prewrapClass = preserveWhitespace ? "is-prewrap" : "";
      return `<div class="text-card ${prewrapClass}">${escapeHtml(item)}</div>`;
    })
    .join("");

  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)} <span class="section-pill">${items.length}</span></h3>
      <div class="text-card-list">${cards}</div>
    </section>
  `;
}

function renderSingleTextSection(title, value) {
  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(value)}</p>
    </section>
  `;
}

function renderBulletList(items, emptyMessage) {
  if (!items.length) {
    return `<div class="empty-inline">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="bullet-list">
      ${items.map((item) => `<div class="bullet-item">${escapeHtml(item)}</div>`).join("")}
    </div>
  `;
}

function createBadgeMarkup(type, label) {
  return `<span class="badge is-${type}">${escapeHtml(label)}</span>`;
}

function createEmptyTreeSearchInfo() {
  return {
    matchedPaths: new Set(),
    autoExpandedPaths: new Set(["root"]),
    matchCount: 0
  };
}

function findTreeMatches(value, query) {
  const searchInfo = createEmptyTreeSearchInfo();

  function visit(node, path, label, ancestors) {
    const selfMatches = buildTreeSearchText(node, label).includes(query);
    let descendantMatches = false;

    if (isContainer(node)) {
      const isArray = Array.isArray(node);
      const entries = isArray ? node.map((item, index) => [index, item]) : Object.entries(node);
      entries.forEach(([childKey, childValue]) => {
        const childPath = createTreePath(path, childKey, isArray);
        if (visit(childValue, childPath, String(childKey), [...ancestors, path])) {
          descendantMatches = true;
        }
      });
    }

    if (selfMatches) {
      searchInfo.matchedPaths.add(path);
      searchInfo.matchCount += 1;
      ancestors.forEach((ancestor) => searchInfo.autoExpandedPaths.add(ancestor));
      searchInfo.autoExpandedPaths.add(path);
    }

    if (descendantMatches) {
      searchInfo.autoExpandedPaths.add(path);
      ancestors.forEach((ancestor) => searchInfo.autoExpandedPaths.add(ancestor));
    }

    return selfMatches || descendantMatches;
  }

  visit(value, "root", "root", []);
  return searchInfo;
}

function collectContainerPaths(value) {
  const paths = new Set(["root"]);

  function visit(node, path) {
    if (!isContainer(node)) {
      return;
    }

    paths.add(path);
    const isArray = Array.isArray(node);
    const entries = isArray ? node.map((item, index) => [index, item]) : Object.entries(node);
    entries.forEach(([childKey, childValue]) => {
      visit(childValue, createTreePath(path, childKey, isArray));
    });
  }

  visit(value, "root");
  return paths;
}

function createTreePath(parentPath, childKey, parentIsArray) {
  return parentIsArray ? `${parentPath}[${childKey}]` : `${parentPath}.${childKey}`;
}

function formatTreeLabel(label, parentIsArray) {
  return parentIsArray ? `[${label}]` : label;
}

function buildTreeSearchText(value, label) {
  if (isContainer(value)) {
    const typeLabel = Array.isArray(value) ? "array" : "object";
    return `${label} ${typeLabel}`.toLowerCase();
  }

  return `${label} ${String(value)}`.toLowerCase();
}

function formatTreePrimitive(value) {
  if (typeof value === "string") {
    return { text: truncate(JSON.stringify(value), 180), className: "is-string" };
  }
  if (typeof value === "number") {
    return { text: String(value), className: "is-number" };
  }
  if (typeof value === "boolean") {
    return { text: String(value), className: "is-boolean" };
  }
  if (value === null) {
    return { text: "null", className: "is-null" };
  }
  return { text: String(value), className: "" };
}

function isContainer(value) {
  return value !== null && typeof value === "object";
}

function countControls(controls) {
  return controls.reduce(
    (counts, control) => {
      if (control.status === "complete") {
        counts.complete += 1;
      } else if (control.status === "missing") {
        counts.missing += 1;
      } else {
        counts.partial += 1;
      }
      return counts;
    },
    { complete: 0, partial: 0, missing: 0 }
  );
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "complete" || normalized === "partial" || normalized === "missing") {
    return normalized;
  }
  return "partial";
}

function normalizeRiskLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return "medium";
}

function normalizeConfidence(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  if (numericValue > 1 && numericValue <= 100) {
    return numericValue / 100;
  }
  return Math.min(Math.max(numericValue, 0), 1);
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter(Boolean);
}

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toInteger(value, fallback = null) {
  const numericValue = Number(value);
  if (Number.isInteger(numericValue)) {
    return numericValue;
  }
  return fallback;
}

function toNumberOrNull(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatPercent(value) {
  if (value === null) {
    return "Unavailable";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDuration(value) {
  if (value === null) {
    return "Unavailable";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(1)} s`;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }
  return new Intl.NumberFormat().format(value);
}

function formatDateTime(value) {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function truncate(value, maxLength) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function titleCase(value) {
  return String(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeId(value) {
  return titleCase(String(value || "").replace(/_/g, " "));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
