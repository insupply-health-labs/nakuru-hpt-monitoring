import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { FileText, Upload } from "lucide-react";
import api from "../api/api";
import "./FacilityTrends.css";

interface FacilityRecord {
  mfl_code: string;
  facility_name: string;
  subcounty_name?: string;
  ward_name?: string;

  reporting_period: string;
  funding_source?: string;
  procurement_source?: string;
  date_received?: string;

  amount_received: number;
  amount_allocated_to_hpt: number;
  amount_spent_on_hpt: number;

  hpt_percent: number;
  compliance_status: string;

  supporting_document: string;
  submitted_by?: string;

  review_status?: string;
  review_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;

  amount_used_for_chp_kits?: number;
  chp_kits_percent_of_hpt?: number;
  chp_kits_status?: string;
}

interface LoggedInUser {
  facility_mfl_code?: string | number;
  mfl_code?: string | number;
  facility_name?: string;
  name?: string;

  facility?: {
    mfl_code?: string | number;
    facility_name?: string;
  };
}

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function readLoggedInUser(): LoggedInUser {
  try {
    return JSON.parse(
      sessionStorage.getItem("hpt_user") || "{}"
    );
  } catch (error) {
    console.error("Failed to read logged-in user:", error);
    return {};
  }
}

function formatReviewDate(value?: string) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value.replace(" ", "T"));

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeMflCode(value?: string | number) {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
}

function getReviewStatus(record: FacilityRecord) {
  const status = String(
    record.review_status || "Pending"
  )
    .trim()
    .toLowerCase();

  if (status === "accepted") {
    return "Accepted";
  }

  if (status === "rejected") {
    return "Rejected";
  }

  if (status === "resubmitted") {
    return "Resubmitted";
  }

  return "Pending";
}

function getReviewStatusClass(status: string) {
  if (status === "Accepted") {
    return "review-status-accepted";
  }

  if (status === "Rejected") {
    return "review-status-rejected";
  }

  if (status === "Resubmitted") {
    return "review-status-resubmitted";
  }

  return "review-status-pending";
}

function reportingPeriodTimestamp(period?: string) {
  const value = String(period || "").trim();

  const monthNames: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const monthYearMatch = value.match(
    /^([A-Za-z]{3})-(\d{4})$/
  );

  if (monthYearMatch) {
    const month =
      monthNames[
        monthYearMatch[1].charAt(0).toUpperCase() +
          monthYearMatch[1].slice(1).toLowerCase()
      ];

    const year = Number(monthYearMatch[2]);

    if (month !== undefined && !Number.isNaN(year)) {
      return new Date(year, month, 1).getTime();
    }
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
}

function FacilityTrends() {
  const user = useMemo(() => readLoggedInUser(), []);

  const facilityMfl =
    user.facility_mfl_code ??
    user.mfl_code ??
    user.facility?.mfl_code ??
    "";

  const facilityName =
    user.facility_name ??
    user.facility?.facility_name ??
    user.name ??
    "this facility";

  const [records, setRecords] = useState<FacilityRecord[]>(
    []
  );

  const [loading, setLoading] = useState(true);

  const [selectedDocumentUrl, setSelectedDocumentUrl] =
    useState("");

  const [replacingRecordKey, setReplacingRecordKey] =
    useState("");

  async function loadRecords(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const response = await api.get("/records");
      setRecords(response.data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to load facility submissions.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadRecords(true);
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        selectedDocumentUrl
      ) {
        setSelectedDocumentUrl((currentUrl) => {
          if (currentUrl.startsWith("blob:")) {
            URL.revokeObjectURL(currentUrl);
          }

          return "";
        });
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedDocumentUrl]);

  const facilityRecords = useMemo(() => {
    const loggedInMfl = normalizeMflCode(facilityMfl);

    if (!loggedInMfl) {
      return [];
    }

    return records
      .filter(
        (record) =>
          normalizeMflCode(record.mfl_code) ===
          loggedInMfl
      )
      .sort(
        (firstRecord, secondRecord) =>
          reportingPeriodTimestamp(
            firstRecord.reporting_period
          ) -
          reportingPeriodTimestamp(
            secondRecord.reporting_period
          )
      );
  }, [records, facilityMfl]);

  const trendData = useMemo(() => {
    return facilityRecords.map((record) => ({
      reporting_period: record.reporting_period,
      hpt_percent: Number(record.hpt_percent || 0),
    }));
  }, [facilityRecords]);

  const latestRecord =
    facilityRecords.length > 0
      ? facilityRecords[facilityRecords.length - 1]
      : undefined;

  const acceptedSubmissions = facilityRecords.filter(
    (record) => getReviewStatus(record) === "Accepted"
  ).length;

  const rejectedSubmissions = facilityRecords.filter(
    (record) => getReviewStatus(record) === "Rejected"
  );

  async function openDocument(path: string) {
    if (!path) {
      return;
    }

    try {
      const response = await api.get(path, {
        responseType: "blob",
      });

      const contentType = String(
        response.headers["content-type"] ||
        "application/pdf"
      );

      const blob = new Blob(
        [response.data],
        { type: contentType }
      );

      const objectUrl = URL.createObjectURL(blob);

      setSelectedDocumentUrl((currentUrl) => {
        if (currentUrl.startsWith("blob:")) {
          URL.revokeObjectURL(currentUrl);
        }

        return objectUrl;
      });
    } catch (error: any) {
      console.error(
        "Failed to open supporting document:",
        error
      );

      const status = error?.response?.status;

      if (status === 401) {
        alert(
          "Your login session has expired. Please sign in again."
        );
        return;
      }

      if (status === 403) {
        alert(
          "You do not have permission to view this document."
        );
        return;
      }

      if (status === 404) {
        alert("The supporting document could not be found.");
        return;
      }

      alert("Unable to open the supporting document.");
    }
  }

  async function replaceDocument(
    record: FacilityRecord,
    file: File
  ) {
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file only.");
      return;
    }

    if (getReviewStatus(record) !== "Rejected") {
      alert(
        "A document can only be replaced when the submission has been rejected."
      );
      return;
    }

    const confirmed = window.confirm(
      `Replace the supporting document for ${record.reporting_period}?`
    );

    if (!confirmed) {
      return;
    }

    const recordKey =
      `${record.mfl_code}-${record.reporting_period}`;

    const formData = new FormData();

    formData.append(
      "mfl_code",
      String(record.mfl_code)
    );

    formData.append(
      "reporting_period",
      String(record.reporting_period)
    );

    formData.append(
      "supporting_document",
      file
    );

    setReplacingRecordKey(recordKey);

    try {
      const response = await api.post(
        "/records/replace-document",
        formData
      );

      if (response.data?.success === false) {
        throw new Error(
          response.data?.message ||
            "Failed to replace supporting document."
        );
      }

      alert("Supporting document replaced successfully.");

      await loadRecords();
    } catch (error: any) {
      console.error(error);

      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to replace supporting document.";

      alert(message);
    } finally {
      setReplacingRecordKey("");
    }
  }

  if (loading) {
    return (
      <div className="facility-trends-page">
        Loading facility trends...
      </div>
    );
  }

  if (!normalizeMflCode(facilityMfl)) {
    return (
      <div className="facility-trends-page">
        <div className="facility-correction-alert">
          <strong>
            No facility is linked to this account.
          </strong>

          <span>
            The logged-in account does not have an MFL
            code. Please log out and sign in using a
            registered facility account.
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="facility-trends-page">
        <div className="facility-trends-header">
          <div>
            <h2>Facility Performance Trend</h2>

            <p>
              Monthly HPT compliance performance for{" "}
              <strong>{facilityName}</strong>.
            </p>
          </div>
        </div>

        {rejectedSubmissions.length > 0 && (
          <div className="facility-correction-alert">
            <strong>
              {rejectedSubmissions.length} submission
              {rejectedSubmissions.length === 1
                ? ""
                : "s"}{" "}
              require correction.
            </strong>

            <span>
              Review the rejection reason below and
              replace the incorrect supporting document.
            </span>
          </div>
        )}

        <div className="facility-kpi-grid">
          <div className="facility-kpi-card">
            <span>Total Submissions</span>
            <strong>{facilityRecords.length}</strong>
          </div>

          <div className="facility-kpi-card">
            <span>Latest HPT Compliance</span>

            <strong>
              {latestRecord
                ? `${latestRecord.hpt_percent}%`
                : "0%"}
            </strong>
          </div>

          <div className="facility-kpi-card">
            <span>Accepted Submissions</span>
            <strong>{acceptedSubmissions}</strong>
          </div>

          <div className="facility-kpi-card">
            <span>Requires Correction</span>
            <strong>
              {rejectedSubmissions.length}
            </strong>
          </div>
        </div>

        <div className="facility-chart-grid">
          <div className="facility-chart-card facility-chart-card-full">
            <h3>
              Monthly HPT Compliance Progression
            </h3>

            <ResponsiveContainer
              width="100%"
              height={320}
            >
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="reporting_period" />

                <YAxis />

                <Tooltip
                  formatter={(value) => `${value}%`}
                />

                <Legend />

                <Line
                  type="monotone"
                  dataKey="hpt_percent"
                  name="HPT Compliance %"
                  stroke="#2563eb"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="facility-submissions-card">
          <h3>My Submissions</h3>

          <div className="facility-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reporting Period</th>
                  <th>Total Funding</th>
                  <th>HPT Allocated</th>
                  <th>HPT Spent</th>
                  <th>HPT Status</th>
                  <th>Review Status</th>
                  <th>Review Details</th>
                  <th>Document</th>
                  <th>Correction</th>
                </tr>
              </thead>

              <tbody>
                {facilityRecords.map(
                  (record, index) => {
                    const reviewStatus =
                      getReviewStatus(record);

                    const recordKey =
                      `${record.mfl_code}-${record.reporting_period}`;

                    const isReplacing =
                      replacingRecordKey === recordKey;

                    return (
                      <tr
                        key={`${record.mfl_code}-${record.reporting_period}-${index}`}
                      >
                        <td>
                          {record.reporting_period || "—"}
                        </td>

                        <td>
                          {money(record.amount_received)}
                        </td>

                        <td>
                          {money(
                            record.amount_allocated_to_hpt
                          )}
                        </td>

                        <td>
                          {money(
                            record.amount_spent_on_hpt
                          )}
                        </td>

                        <td>
                          <span
                            className={
                              record.compliance_status ===
                              "Compliant"
                                ? "status compliant"
                                : "status non-compliant"
                            }
                          >
                            {record.compliance_status}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`review-status ${getReviewStatusClass(
                              reviewStatus
                            )}`}
                          >
                            {reviewStatus}
                          </span>
                        </td>

                        <td>
                          <div className="facility-review-details">
                            {reviewStatus ===
                              "Pending" && (
                              <small>
                                Not yet reviewed
                              </small>
                            )}

                            {reviewStatus ===
                              "Resubmitted" && (
                              <small>
                                Correction submitted.
                                Awaiting review.
                              </small>
                            )}

                            {record.reviewed_by && (
                              <small>
                                Reviewed by:{" "}
                                {record.reviewed_by}
                              </small>
                            )}

                            {record.reviewed_at && (
                              <small>
                                Reviewed on:{" "}
                                {formatReviewDate(
                                  record.reviewed_at
                                )}
                              </small>
                            )}

                            {reviewStatus ===
                              "Rejected" &&
                              record.review_reason && (
                                <small className="facility-rejection-reason">
                                  Reason:{" "}
                                  {record.review_reason}
                                </small>
                              )}
                          </div>
                        </td>

                        <td>
                          {record.supporting_document ? (
                            <button
                              type="button"
                              className="facility-doc-btn"
                              onClick={() =>
                                openDocument(
                                  record.supporting_document
                                )
                              }
                            >
                              <FileText size={15} />
                              View
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td>
                          {reviewStatus ===
                          "Rejected" ? (
                            <label
                              className={`facility-replace-btn ${
                                isReplacing
                                  ? "facility-replace-btn-disabled"
                                  : ""
                              }`}
                            >
                              <Upload size={15} />

                              {isReplacing
                                ? "Uploading..."
                                : "Replace Document"}

                              <input
                                type="file"
                                accept="application/pdf"
                                hidden
                                disabled={isReplacing}
                                onChange={(event) => {
                                  const file =
                                    event.target.files?.[0];

                                  if (file) {
                                    void replaceDocument(
                                      record,
                                      file
                                    );
                                  }

                                  event.target.value = "";
                                }}
                              />
                            </label>
                          ) : (
                            <span
                              className={
                                reviewStatus ===
                                "Accepted"
                                  ? "correction-not-required"
                                  : "correction-awaiting"
                              }
                            >
                              {reviewStatus ===
                              "Accepted"
                                ? "No correction required"
                                : "Awaiting review"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}

                {facilityRecords.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      No submissions found for this
                      facility.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedDocumentUrl && (
        <div
          className="pdf-modal-overlay"
          onClick={() =>
            setSelectedDocumentUrl("")
          }
        >
          <div
            className="pdf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="facility-document-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="pdf-modal-header">
              <h3 id="facility-document-title">
                Supporting Document
              </h3>

              <button
                type="button"
                onClick={() =>
                  setSelectedDocumentUrl("")
                }
              >
                Close
              </button>
            </div>

            <iframe
              src={selectedDocumentUrl}
              title="Supporting Document Preview"
              className="pdf-frame"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default FacilityTrends;