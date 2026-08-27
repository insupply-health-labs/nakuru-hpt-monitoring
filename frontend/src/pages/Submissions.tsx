import { useEffect, useMemo, useState } from "react";
import { Check, Download, FileText, Search, XCircle } from "lucide-react";
import api from "../api/api";
import "./Submissions.css";
import MultiCheckboxFilter from "../components/MultiCheckboxFilter";

type ReviewStatus = "Pending" | "Accepted" | "Rejected";

interface Submission {
  id?: number | string;
  mfl_code: string;
  facility_name: string;
  subcounty_name: string;
  ward_name: string;
  reporting_period: string;
  financial_year?: string;
  reporting_quarter?: string;
  funding_source: string;

  // The formatter supports any of these possible backend field names.
  funding_source_detail?: string;
  funding_source_name?: string;
  partner_donor_name?: string;
  partner_name?: string;
  donor_name?: string;
  partner_funding_name?: string;
  donor_funding_name?: string;
  other_funding_source?: string;
  funding_source_other?: string;

  procurement_source: string;
  amount_received: number;
  amount_allocated_to_hpt: number;
  amount_spent_on_hpt: number;
  hpt_percent: number;
  compliance_status: string;

  // Retained in the API/data, but no longer displayed in this table.
  amount_used_for_chp_kits?: number;
  chp_kits_percent_of_hpt?: number;
  chp_kits_status?: string;

  date_received: string;
  submitted_by: string;
  supporting_document: string;

  review_status?: ReviewStatus | string;
  review_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

const REVIEW_ENDPOINT = "/records/review";

const fundingSources = [
  "County Allocation",
  "FIF",
  "SHIF",
  "PHC",
  "Partner Funding",
  "Donor Funding",
];

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function canonicalFundingSource(source: string) {
  const cleaned = String(source || "").trim();
  const normalized = cleaned.toLowerCase();

  if (
    normalized === "partners" ||
    normalized === "partner" ||
    normalized === "partner funding"
  ) {
    return "Partner Funding";
  }

  if (
    normalized === "donations" ||
    normalized === "donation" ||
    normalized === "donor" ||
    normalized === "donor funding"
  ) {
    return "Donor Funding";
  }

  return cleaned;
}

function getFundingSourceDetail(record: Submission) {
  const possibleDetails = [
    record.funding_source_detail,
    record.funding_source_name,
    record.partner_donor_name,
    record.partner_name,
    record.donor_name,
    record.partner_funding_name,
    record.donor_funding_name,
    record.other_funding_source,
    record.funding_source_other,
  ];

  return (
    possibleDetails.find(
      (value) => value && String(value).trim() !== ""
    )?.trim() || ""
  );
}

function formatFundingSource(record: Submission) {
  const source = canonicalFundingSource(record.funding_source);
  const detail = getFundingSourceDetail(record);

  if (
    detail &&
    (source === "Partner Funding" || source === "Donor Funding")
  ) {
    return `${source} (${detail})`;
  }

  return source || "—";
}

function getReviewStatus(record: Submission): ReviewStatus {
  const normalized = String(record.review_status || "Pending")
    .trim()
    .toLowerCase();

  if (normalized === "accepted") {
    return "Accepted";
  }

  if (normalized === "rejected") {
    return "Rejected";
  }

  return "Pending";
}

function sameSubmission(first: Submission, second: Submission) {
  if (
    first.id !== undefined &&
    first.id !== null &&
    second.id !== undefined &&
    second.id !== null
  ) {
    return String(first.id) === String(second.id);
  }

  return (
    String(first.mfl_code) === String(second.mfl_code) &&
    String(first.reporting_period) === String(second.reporting_period)
  );
}

function Submissions() {
  const [records, setRecords] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedSubcounty, setSelectedSubcounty] = useState<string[]>(["All"]);
  const [selectedWard, setSelectedWard] = useState<string[]>(["All"]);
  const [selectedFacility, setSelectedFacility] = useState<string[]>(["All"]);
  const [selectedFinancialYear, setSelectedFinancialYear] =
    useState<string[]>(["All"]);
  const [selectedQuarter, setSelectedQuarter] =
    useState<string[]>(["All"]);
  const [selectedFundingSource, setSelectedFundingSource] = useState<string[]>([
    "All",
  ]);

  const [page, setPage] = useState(1);
  const rowsPerPage = 15;

  const [selectedDocumentUrl, setSelectedDocumentUrl] = useState("");
  const [recordToReject, setRecordToReject] =
  useState<Submission | null>(null);

const [rejectionReason, setRejectionReason] = useState("");
const [reviewError, setReviewError] = useState("");
const [reviewSaving, setReviewSaving] = useState(false);

  const financialYears = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(
          records
            .map((record) => String(record.financial_year || "").trim())
            .filter(Boolean)
        )
      ).sort(),
    ];
  }, [records]);

  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  useEffect(() => {
    api
      .get("/records")
      .then((res) => {
        setRecords(res.data || []);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load submissions");
      })
      .finally(() => setLoading(false));
  }, []);

  const subcounties = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(
          records
            .map((record) => record.subcounty_name)
            .filter((name) => name && name.trim() !== "")
        )
      ).sort((a, b) => a.localeCompare(b)),
    ];
  }, [records]);

  const wards = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(
          records
            .map((record) => record.ward_name)
            .filter((name) => name && name.trim() !== "")
        )
      ).sort((a, b) => a.localeCompare(b)),
    ];
  }, [records]);

  const facilityOptions = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(
          records
            .map(
              (record) => `${record.facility_name} - ${record.mfl_code}`
            )
            .filter((name) => name && name.trim() !== "")
        )
      ).sort((a, b) => a.localeCompare(b)),
    ];
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const facilityLabel = `${record.facility_name} - ${record.mfl_code}`;
      const searchValue = search.trim().toLowerCase();
      const fundingSourceText = formatFundingSource(record).toLowerCase();
      const reviewStatusText = getReviewStatus(record).toLowerCase();

      const matchesSearch =
        searchValue === "" ||
        String(record.facility_name || "")
          .toLowerCase()
          .includes(searchValue) ||
        String(record.subcounty_name || "")
          .toLowerCase()
          .includes(searchValue) ||
        String(record.ward_name || "")
          .toLowerCase()
          .includes(searchValue) ||
        String(record.mfl_code || "")
          .toLowerCase()
          .includes(searchValue) ||
        String(record.submitted_by || "")
          .toLowerCase()
          .includes(searchValue) ||
        fundingSourceText.includes(searchValue) ||
        reviewStatusText.includes(searchValue) ||
        String(record.review_reason || "")
          .toLowerCase()
          .includes(searchValue);

      const matchesSubcounty =
        selectedSubcounty.includes("All") ||
        selectedSubcounty.includes(record.subcounty_name);

      const matchesWard =
        selectedWard.includes("All") ||
        selectedWard.includes(record.ward_name);

      const matchesFacility =
        selectedFacility.includes("All") ||
        selectedFacility.includes(facilityLabel);

      const matchesFinancialYear =
        selectedFinancialYear.includes("All") ||
        selectedFinancialYear.includes(
          String(record.financial_year || "")
        );

      const matchesQuarter =
        selectedQuarter.includes("All") ||
        selectedQuarter.includes(
          String(record.reporting_quarter || "")
        );

      const matchesFundingSource =
        selectedFundingSource.includes("All") ||
        selectedFundingSource.some((source) =>
          fundingSourceText.includes(source.toLowerCase())
        );

      return (
        matchesSearch &&
        matchesSubcounty &&
        matchesWard &&
        matchesFacility &&
        matchesFinancialYear &&
        matchesQuarter &&
        matchesFundingSource
      );
    });
  }, [
    records,
    search,
    selectedSubcounty,
    selectedWard,
    selectedFacility,
    selectedFinancialYear,
    selectedQuarter,
    selectedFundingSource,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / rowsPerPage)
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedRecords = filteredRecords.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const totalSubmissions = filteredRecords.length;

  const compliantFacilities = filteredRecords.filter(
    (record) => record.compliance_status === "Compliant"
  ).length;

  const nonCompliantFacilities = filteredRecords.filter(
    (record) => record.compliance_status === "Non-Compliant"
  ).length;

  const totalDocuments = filteredRecords.filter(
    (record) => record.supporting_document
  ).length;

  function openDocument(path: string) {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    const documentPath = path.startsWith("/") ? path : `/${path}`;

    setSelectedDocumentUrl(`${baseUrl}${documentPath}`);
  }

  function closeRejectModal() {
  if (reviewSaving) {
    return;
  }

  setRecordToReject(null);
  setRejectionReason("");
  setReviewError("");
}

  async function saveReview(
    record: Submission,
    reviewStatus: "Accepted" | "Rejected",
    reason = ""
  ) {
    const cleanReason = reason.trim();

setReviewError("");

if (reviewStatus === "Rejected" && !cleanReason) {
  setReviewError(
    "Please enter the reason for rejecting this submission."
  );
  return;
}

setReviewSaving(true);

    try {
      const response = await api.patch(REVIEW_ENDPOINT, {
        record_id: record.id,
        mfl_code: record.mfl_code,
        reporting_period: record.reporting_period,
        review_status: reviewStatus,
        review_reason: reviewStatus === "Rejected" ? cleanReason : "",
      });

      const possibleServerRecord =
        response.data?.record || response.data?.submission;

      const serverRecord =
        possibleServerRecord && typeof possibleServerRecord === "object"
          ? possibleServerRecord
          : {};

      const locallyUpdatedRecord: Partial<Submission> = {
        review_status: reviewStatus,
        review_reason: reviewStatus === "Rejected" ? cleanReason : "",
        reviewed_by:
          response.data?.reviewed_by ||
          serverRecord.reviewed_by ||
          record.reviewed_by,
        reviewed_at:
          response.data?.reviewed_at ||
          serverRecord.reviewed_at ||
          new Date().toISOString(),
      };

      setRecords((currentRecords) =>
        currentRecords.map((currentRecord) =>
          sameSubmission(currentRecord, record)
            ? {
                ...currentRecord,
                ...locallyUpdatedRecord,
                ...serverRecord,
              }
            : currentRecord
        )
      );

      setRecordToReject(null);
      setRejectionReason("");
    } catch (error: any) {
  console.error("Review submission error:", error);

  const message =
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    "Failed to save the review decision.";

  setReviewError(message);
} finally {
  setReviewSaving(false);
}
  }

  async function acceptSubmission(record: Submission) {
    const confirmed = window.confirm(
      `Accept the submission for ${record.facility_name}, ${record.reporting_period}?`
    );

    if (!confirmed) {
      return;
    }

    await saveReview(record, "Accepted");
  }

  async function confirmRejection() {
    if (!recordToReject) {
      return;
    }

    await saveReview(recordToReject, "Rejected", rejectionReason);
  }

  function downloadCSV() {
    const headers = [
      "Facility",
      "MFL Code",
      "Subcounty",
      "Ward",
      "Reporting Period",
      "Funding Source",
      "Procurement Source",
      "Date Received",
      "Amount Received",
      "HPT Allocated",
      "HPT Spent",
      "HPT %",
      "HPT Status",
      "Submitted By",
      "Review Status",
      "Review Reason",
      "Reviewed By",
      "Reviewed At",
      "Supporting Document",
    ];

    const rows = filteredRecords.map((record) => [
      record.facility_name,
      record.mfl_code,
      record.subcounty_name,
      record.ward_name,
      record.reporting_period,
      formatFundingSource(record),
      record.procurement_source,
      record.date_received,
      record.amount_received,
      record.amount_allocated_to_hpt,
      record.amount_spent_on_hpt,
      record.hpt_percent,
      record.compliance_status,
      record.submitted_by,
      getReviewStatus(record),
      record.review_reason || "",
      record.reviewed_by || "",
      record.reviewed_at || "",
      record.supporting_document,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map(
            (cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "hpt_submissions.csv";
    link.click();

    window.URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="dashboard-loading">Loading submissions...</div>;
  }

  return (
    <>
      <div className="submissions-page">
        <div className="submissions-heading">
          <div>
            <h2>Submissions</h2>
            <p>
              Track submitted HPT compliance records and review supporting
              documents.
            </p>
          </div>
        </div>

        <div className="dashboard-filters">
          <MultiCheckboxFilter
            label="Subcounty"
            options={subcounties.filter((item) => item !== "All")}
            selected={selectedSubcounty}
            onChange={setSelectedSubcounty}
          />

          <MultiCheckboxFilter
            label="Ward"
            options={wards.filter((item) => item !== "All")}
            selected={selectedWard}
            onChange={setSelectedWard}
          />

          <MultiCheckboxFilter
            label="Facility"
            options={facilityOptions.filter((item) => item !== "All")}
            selected={selectedFacility}
            onChange={setSelectedFacility}
          />

          <MultiCheckboxFilter
            label="Financial Year"
            options={financialYears.filter((item) => item !== "All")}
            selected={selectedFinancialYear}
            onChange={setSelectedFinancialYear}
          />

          <MultiCheckboxFilter
            label="Quarter"
            options={quarters}
            selected={selectedQuarter}
            onChange={setSelectedQuarter}
          />

          <MultiCheckboxFilter
            label="Funding Source"
            options={fundingSources}
            selected={selectedFundingSource}
            onChange={setSelectedFundingSource}
          />
        </div>

        <div className="submissions-kpis">
          <div className="submission-kpi">
            <span>Total Submissions</span>
            <strong>{totalSubmissions}</strong>
          </div>

          <div className="submission-kpi">
            <span>HPT Compliant</span>
            <strong>{compliantFacilities}</strong>
          </div>

          <div className="submission-kpi">
            <span>HPT Non-Compliant</span>
            <strong>{nonCompliantFacilities}</strong>
          </div>

          <div className="submission-kpi">
            <span>With Documents</span>
            <strong>{totalDocuments}</strong>
          </div>
        </div>

        <div className="submissions-card">
          <div className="submissions-toolbar">
            <div className="submission-search">
              <Search size={16} />

              <input
                type="text"
                placeholder="Search by facility, MFL, ward, subcounty, funding source, status, or submitted by..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>

            <button
              className="download-btn"
              type="button"
              onClick={downloadCSV}
            >
              <Download size={16} />
              Download Table
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Subcounty</th>
                  <th>Ward</th>
                  <th>Reporting Period</th>
                  <th>Funding Source</th>
                  <th>Procurement Source</th>
                  <th>Date Received</th>
                  <th>Amount Received</th>
                  <th>HPT %</th>
                  <th>HPT Status</th>
                  <th>Submitted By</th>
                  <th>Review Status</th>
                  <th>Actions</th>
                  <th>Document</th>
                </tr>
              </thead>

              <tbody>
                {paginatedRecords.map((record, index) => {
                  const reviewStatus = getReviewStatus(record);

                  return (
                    <tr
                      key={`${record.mfl_code}-${record.reporting_period}-${index}`}
                    >
                      <td>
                        <strong>{record.facility_name}</strong>
                        <small>MFL: {record.mfl_code}</small>
                      </td>

                      <td>{record.subcounty_name || "—"}</td>
                      <td>{record.ward_name || "—"}</td>
                      <td>
                        {record.financial_year && record.reporting_quarter
                          ? `${record.financial_year} ${record.reporting_quarter}`
                          : record.reporting_period || "—"}
                      </td>
                      <td>{formatFundingSource(record)}</td>
                      <td>{record.procurement_source || "—"}</td>
                      <td>{record.date_received || "—"}</td>
                      <td>{money(record.amount_received)}</td>
                      <td>{record.hpt_percent}%</td>

                      <td>
                        <span
                          className={
                            record.compliance_status === "Compliant"
                              ? "status compliant"
                              : "status non-compliant"
                          }
                        >
                          {record.compliance_status}
                        </span>
                      </td>

                      <td>{record.submitted_by || "—"}</td>

                      <td>
                        <div className="review-status-cell">
                          <span
                            className={`review-status review-status-${reviewStatus.toLowerCase()}`}
                          >
                            {reviewStatus}
                          </span>

                          {reviewStatus === "Rejected" &&
                            record.review_reason && (
                              <small
                                className="review-reason"
                                title={record.review_reason}
                              >
                                {record.review_reason}
                              </small>
                            )}
                        </div>
                      </td>

                      <td>
                        <div className="review-actions">
                          <button
                            type="button"
                            className="review-action-btn accept-review-btn"
                            disabled={
                              reviewSaving || reviewStatus === "Accepted"
                            }
                            onClick={() => acceptSubmission(record)}
                            title="Accept submission"
                          >
                            <Check size={15} />
                            Accept
                          </button>

                          <button
                            type="button"
                            className="review-action-btn reject-review-btn"
                            disabled={
                              reviewSaving || reviewStatus === "Rejected"
                            }
                            onClick={() => {
                              setRecordToReject(record);
                              setRejectionReason(record.review_reason || "");
                              setReviewError("");
                            }}
                            title="Reject submission"
                          >
                            <XCircle size={15} />
                            Reject
                          </button>
                        </div>
                      </td>

                      <td>
                        {record.supporting_document ? (
                          <button
                            className="view-doc-btn document-pill"
                            type="button"
                            onClick={() =>
                              openDocument(record.supporting_document)
                            }
                          >
                            <FileText size={16} />
                            View
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}

                {paginatedRecords.length === 0 && (
                  <tr>
                    <td colSpan={14}>
                      No submissions found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="table-footer">
            Showing {filteredRecords.length} submission(s).
          </p>

          <div className="pagination">
            <button
              type="button"
              disabled={page === 1}
              onClick={() =>
                setPage((currentPage) => currentPage - 1)
              }
            >
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page === totalPages}
              onClick={() =>
                setPage((currentPage) => currentPage + 1)
              }
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedDocumentUrl && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal">
            <div className="pdf-modal-header">
              <h3>Supporting Document</h3>

              <button
                type="button"
                onClick={() => setSelectedDocumentUrl("")}
              >
                Close
              </button>
            </div>

            <iframe
              src={selectedDocumentUrl}
              title="Document Preview"
              className="pdf-frame"
            />
          </div>
        </div>
      )}

      {recordToReject && (
  <div className="review-modal-overlay">
    <form
      className="review-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-submission-title"
      onSubmit={(event) => {
        event.preventDefault();
        confirmRejection();
      }}
    >
      <div className="review-modal-header">
        <div>
          <h3 id="reject-submission-title">
            Reject Submission
          </h3>

          <p>
            {recordToReject.facility_name} —{" "}
            {recordToReject.reporting_period}
          </p>
        </div>

        <button
          type="button"
          className="review-modal-close"
          onClick={closeRejectModal}
          disabled={reviewSaving}
          aria-label="Close rejection form"
        >
          ×
        </button>
      </div>

      <label
        className="review-reason-label"
        htmlFor="rejection-reason"
      >
        Reason for rejection
      </label>

      <textarea
        id="rejection-reason"
        value={rejectionReason}
        onChange={(event) => {
          setRejectionReason(event.target.value);

          if (reviewError) {
            setReviewError("");
          }
        }}
        placeholder="Explain what the facility should correct..."
        rows={5}
        disabled={reviewSaving}
        autoFocus
      />

      {reviewError && (
        <div className="review-error-message">
          {reviewError}
        </div>
      )}

      <div className="review-modal-actions">
        <button
          type="button"
          className="review-cancel-btn"
          onClick={closeRejectModal}
          disabled={reviewSaving}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="review-confirm-reject-btn"
          disabled={reviewSaving}
        >
          <XCircle size={16} />

          {reviewSaving
            ? "Saving..."
            : "Confirm Rejection"}
        </button>
      </div>
    </form>
  </div>
)}
    </>
  );
}

export default Submissions;