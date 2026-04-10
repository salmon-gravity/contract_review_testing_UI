const state = {
  rawData: null,
  normalizedData: null,
  selectedControlId: null,
  activeStatusFilter: "all",
  highRiskOnly: false,
  searchQuery: "",
  selectedFile: null,
  uploadStatus: "idle",
  uploadError: null,
  feedback: null,
  treeModalOpen: false,
  treeSearchQuery: "",
  expandedTreePaths: new Set(["root"])
};

const dom = {
  uploadButton: document.getElementById("uploadButton"),
  analyzeButton: document.getElementById("analyzeButton"),
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
  detailInsights: document.getElementById("detailInsights"),
  detailSections: document.getElementById("detailSections"),
  treeModal: document.getElementById("treeModal"),
  treeModalBackdrop: document.getElementById("treeModalBackdrop"),
  treeCloseButton: document.getElementById("treeCloseButton"),
  treeExpandAllButton: document.getElementById("treeExpandAllButton"),
  treeCollapseAllButton: document.getElementById("treeCollapseAllButton"),
  treeSearchInput: document.getElementById("treeSearchInput"),
  treeSearchStatus: document.getElementById("treeSearchStatus"),
  treeContent: document.getElementById("treeContent")
};

const defaultEmptyMarkup = `
  <div class="empty-state-mark">Review</div>
  <h2>Analyze a contract PDF</h2>
  <p>
    Choose a PDF, run the live clause-review analysis, and inspect the returned control status,
    evidence, remediation guidance, and raw response tree.
  </p>
`;

initialize();

function initialize() {
  dom.uploadButton.addEventListener("click", () => dom.fileInput.click());
  dom.analyzeButton.addEventListener("click", analyzeSelectedFile);
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
  dom.treeCloseButton.addEventListener("click", closeTreeModal);
  dom.treeModalBackdrop.addEventListener("click", closeTreeModal);
  dom.treeExpandAllButton.addEventListener("click", expandAllTreeNodes);
  dom.treeCollapseAllButton.addEventListener("click", collapseAllTreeNodes);
  dom.treeSearchInput.addEventListener("input", onTreeSearchInput);
  dom.treeContent.addEventListener("click", onTreeContentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  render();
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
  if (event.key === "Escape" && state.treeModalOpen) {
    closeTreeModal();
  }
}

function resetFilters() {
  state.activeStatusFilter = "all";
  state.highRiskOnly = false;
  state.searchQuery = "";
  dom.searchInput.value = "";
  dom.highRiskToggle.checked = false;
  syncSelectedControl();
  renderControlsAndDetail();
}

function clearViewer() {
  clearCurrentResults();
  state.selectedFile = null;
  state.uploadStatus = "idle";
  state.uploadError = null;
  state.activeStatusFilter = "all";
  state.highRiskOnly = false;
  state.searchQuery = "";
  state.feedback = null;
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
    setFeedback(`${file.name} is ready for analysis.`, "success");
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
    state.activeStatusFilter = "all";
    state.highRiskOnly = false;
    state.searchQuery = "";
    state.uploadStatus = "uploading";
    state.uploadError = null;
    dom.searchInput.value = "";
    dom.highRiskToggle.checked = false;
    dom.treeSearchInput.value = "";
    setFeedback(
      `Analyzing ${state.selectedFile.name}. This can take some time for longer contracts.`,
      "success"
    );
    render();

    const formData = new FormData();
    formData.append("file", state.selectedFile);

    const response = await fetch("/api/contracts/clause-review/report", {
      method: "POST",
      body: formData
    });

    const contentType = response.headers.get("content-type") || "";
    let payload = null;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      throw new Error(
        `The app received a non-JSON response from the server${text ? `: ${truncate(text, 180)}` : "."}`
      );
    }

    if (!response.ok) {
      throw createApiError(payload, response.status);
    }

    validateContractResponse(payload);
    const normalized = normalizeContractResponse(payload, state.selectedFile.name);

    state.rawData = payload;
    state.normalizedData = normalized;
    state.selectedControlId = getDefaultControlId(normalized);
    state.uploadStatus = "success";
    setFeedback(`Analysis complete for ${state.selectedFile.name}.`, "success");
    render();
  } catch (error) {
    state.uploadStatus = "error";
    state.uploadError = getErrorMessage(error);
    setFeedback(state.uploadError, "error");
    render();
  }
}

function clearCurrentResults() {
  state.rawData = null;
  state.normalizedData = null;
  state.selectedControlId = null;
  state.treeModalOpen = false;
  state.treeSearchQuery = "";
  state.expandedTreePaths = new Set(["root"]);
}

function openTreeModal() {
  if (!state.rawData) {
    return;
  }

  state.treeModalOpen = true;
  renderTreeModal();
  window.setTimeout(() => {
    dom.treeSearchInput.focus();
  }, 0);
}

function closeTreeModal() {
  if (!state.treeModalOpen) {
    return;
  }

  state.treeModalOpen = false;
  renderTreeModal();
  dom.viewTreeButton.focus();
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
    : "The contract could not be analyzed. Try again in a moment.";
}

function createApiError(payload, status) {
  const message =
    (payload && (payload.message || payload.detail)) ||
    `The contract review request failed with status ${status}.`;
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
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
    throw new Error("The JSON root must be an object that matches the contract response schema.");
  }

  if (!Array.isArray(data.controls)) {
    throw new Error("The file is missing a valid controls array.");
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
    renderTreeModal();
    return;
  }

  renderOverview();
  renderStats();
  renderAssessment();
  renderFilters();
  syncSelectedControl();
  renderControlsAndDetail();
  renderTreeModal();
}

function renderUploadState() {
  const hasFile = Boolean(state.selectedFile);
  const status = state.uploadStatus;

  dom.uploadButton.disabled = status === "uploading";
  dom.analyzeButton.disabled = !hasFile || status === "uploading";
  dom.analyzeButton.textContent = status === "uploading" ? "Analyzing..." : "Analyze Contract";

  dom.selectedFileState.className = "selected-file-state";

  if (status === "ready" && hasFile) {
    dom.selectedFileState.classList.add("is-ready");
    dom.selectedFileState.querySelector(".selected-file-mark").textContent = "Ready";
    dom.selectedFileName.textContent = state.selectedFile.name;
    dom.selectedFileHint.textContent = "Click Analyze Contract to upload the PDF and fetch the live review response.";
    return;
  }

  if (status === "uploading" && hasFile) {
    dom.selectedFileState.classList.add("is-uploading");
    dom.selectedFileState.querySelector(".selected-file-mark").textContent = "Uploading";
    dom.selectedFileName.textContent = state.selectedFile.name;
    dom.selectedFileHint.textContent = "The PDF is being sent to the clause-review API. Results will appear below when the response is ready.";
    return;
  }

  if (status === "success" && hasFile) {
    dom.selectedFileState.classList.add("is-success");
    dom.selectedFileState.querySelector(".selected-file-mark").textContent = "Analyzed";
    dom.selectedFileName.textContent = state.selectedFile.name;
    dom.selectedFileHint.textContent = "The live API response has been loaded. Review the controls below or open the raw JSON tree.";
    return;
  }

  if (status === "error") {
    dom.selectedFileState.classList.add("is-error");
    dom.selectedFileState.querySelector(".selected-file-mark").textContent = "Error";
    dom.selectedFileName.textContent = hasFile ? state.selectedFile.name : "Choose a PDF to begin";
    dom.selectedFileHint.textContent =
      state.uploadError || "The PDF could not be analyzed. Choose a valid file and try again.";
    return;
  }

  dom.selectedFileState.querySelector(".selected-file-mark").textContent = "No file selected";
  dom.selectedFileName.textContent = "Choose a PDF to begin";
  dom.selectedFileHint.textContent =
    "The app will upload the file to the contract-review API and render the returned JSON response.";
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

function renderOverview() {
  const data = state.normalizedData;

  const highlightItems = [
    ["Request", data.request_id],
    ["Document", data.document_meta.file_name],
    ["Mode", humanizeId(data.document_meta.text_extraction_mode)],
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
    ["LLM used", data.extraction_meta.llm_used ? "Yes" : "No"]
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
  const cards = [
    {
      label: "Overall risk",
      value: titleCase(data.overall_assessment.risk_level),
      className: `is-risk-${data.overall_assessment.risk_level}`
    },
    {
      label: "Complete",
      value: formatNumber(data.summary.controls_complete),
      className: ""
    },
    {
      label: "Partial",
      value: formatNumber(data.summary.controls_partial),
      className: ""
    },
    {
      label: "Missing",
      value: formatNumber(data.summary.controls_missing),
      className: ""
    },
    {
      label: "Selected",
      value: formatNumber(data.extraction_meta.selected_controls.length),
      className: ""
    },
    {
      label: "High risk",
      value: formatNumber(data.summary.high_risk_controls.length),
      className: ""
    }
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
  dom.assessmentSummaryPill.textContent = `${titleCase(assessment.risk_level)} risk · ${assessment.key_gaps.length} gaps`;
  dom.keyGapsList.innerHTML = renderBulletList(assessment.key_gaps, "No key gaps provided.");
  dom.actionsList.innerHTML = renderBulletList(
    assessment.recommended_next_actions,
    "No recommended next actions provided."
  );
}

function renderFilters() {
  const statusButtons = dom.statusFilters.querySelectorAll("button[data-status]");
  statusButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.status === state.activeStatusFilter);
    button.setAttribute("aria-pressed", button.dataset.status === state.activeStatusFilter ? "true" : "false");
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
      const badges = [
        createBadgeMarkup(control.status, titleCase(control.status)),
        control.isHighRisk ? createBadgeMarkup("high-risk", "High risk") : ""
      ].join("");

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
          </div>

          <p class="control-preview">${escapeHtml(truncate(control.reason, 165))}</p>
        </button>
      `;
    })
    .join("");

  dom.controlsList.querySelectorAll("[data-control-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedControlId = button.dataset.controlId;
      renderControlsAndDetail();
    });
  });

  const selectedControl =
    filteredControls.find((control) => control.control_id === state.selectedControlId) || filteredControls[0];
  state.selectedControlId = selectedControl.control_id;
  renderDetail(selectedControl);
}

function renderDetail(control) {
  dom.detailEmpty.hidden = true;
  dom.detailView.hidden = false;
  dom.assessmentCard.hidden = false;

  dom.detailBadges.innerHTML = [
    createBadgeMarkup(control.status, titleCase(control.status)),
    control.isHighRisk ? createBadgeMarkup("high-risk", "High risk") : "",
    createBadgeMarkup("neutral", humanizeId(control.control_id))
  ].join("");

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
  ].join("");

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

function renderTreeModal() {
  const hasData = Boolean(state.rawData);
  const shouldShow = hasData && state.treeModalOpen;

  dom.viewTreeButton.hidden = !hasData;
  dom.treeModal.hidden = !shouldShow;
  dom.treeModal.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  document.body.classList.toggle("modal-open", shouldShow);

  if (!shouldShow) {
    dom.treeSearchStatus.textContent = "";
    dom.treeContent.innerHTML = "";
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

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
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

