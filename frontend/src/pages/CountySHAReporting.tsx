import { useState } from "react";
import {
  Upload,
  FileText,
  Send,
} from "lucide-react";
import api from "../api/api";
import "./CountySHAReporting.css";

const quarters = ["Q1", "Q2", "Q3", "Q4"];

function CountySHAReporting() {
  const user = JSON.parse(
    sessionStorage.getItem("hpt_user") || "{}"
  );

  const currentYear = new Date().getFullYear();

  const defaultSubmittedBy = `${
    user?.first_name || ""
  } ${user?.last_name || ""}`.trim();

  const [form, setForm] = useState({
    reporting_year: String(currentYear),
    reporting_quarter: "",
    value: "",
    submitted_by: defaultSubmittedBy,
    notes: "",
  });

  const [document, setDocument] =
    useState<File | null>(null);

  const [submitting, setSubmitting] =
    useState(false);

  function updateField(
    field: string,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function handleDocumentChange(
    file: File | null
  ) {
    if (!file) {
      setDocument(null);
      return;
    }

    const allowedExtensions = [
      ".pdf",
      ".xls",
      ".xlsx",
    ];

    const filename = file.name.toLowerCase();

    if (
      !allowedExtensions.some((extension) =>
        filename.endsWith(extension)
      )
    ) {
      alert(
        "Only PDF, XLS and XLSX files are allowed."
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert(
        "The supporting document must not exceed 10 MB."
      );
      return;
    }

    setDocument(file);
  }

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    if (!form.reporting_quarter) {
      alert("Please select a reporting quarter.");
      return;
    }

    const value = Number(form.value);

    if (
      form.value === "" ||
      Number.isNaN(value) ||
      value < 0
    ) {
      alert(
        "Please enter the number of SHA contracted facilities."
      );
      return;
    }

    const data = new FormData();

    data.append(
      "report_type",
      "SHA Contracted Facilities"
    );

    data.append(
      "reporting_year",
      form.reporting_year
    );

    data.append(
      "reporting_month",
      ""
    );

    data.append(
      "reporting_quarter",
      form.reporting_quarter
    );

    data.append(
      "value",
      String(value)
    );

    data.append(
      "submitted_by",
      form.submitted_by ||
        "SHA Coordinator"
    );

    data.append(
      "notes",
      form.notes
    );

    if (document) {
      data.append(
        "supporting_document",
        document
      );
    }

    try {
      setSubmitting(true);

      await api.post(
        "/county-sha-reports",
        data
      );

      alert(
        "SHA contracted facilities report submitted successfully."
      );

      setForm({
        reporting_year: String(currentYear),
        reporting_quarter: "",
        value: "",
        submitted_by: defaultSubmittedBy,
        notes: "",
      });

      setDocument(null);
    } catch (error: any) {
      console.error(error);

      alert(
        error?.response?.data?.detail ||
          "Failed to submit report."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sha-page">
      <div className="sha-header">
        <h2>County SHA Reporting</h2>

        <p>
          Submit the quarterly number of
          SHA contracted facilities.
        </p>
      </div>

      <form
        className="sha-card"
        onSubmit={handleSubmit}
      >
        <div className="sha-section-title">
          <FileText size={18} />

          <span>
            SHA Contracted Facilities
          </span>
        </div>

        <div className="sha-grid">
          <div className="sha-form-group">
            <label>Reporting Year</label>

            <select
              value={form.reporting_year}
              onChange={(event) =>
                updateField(
                  "reporting_year",
                  event.target.value
                )
              }
            >
              {Array.from(
                { length: 6 },
                (_, index) =>
                  currentYear + index
              ).map((year) => (
                <option
                  key={year}
                  value={year}
                >
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="sha-form-group">
            <label>Reporting Quarter</label>

            <select
              value={
                form.reporting_quarter
              }
              onChange={(event) =>
                updateField(
                  "reporting_quarter",
                  event.target.value
                )
              }
              required
            >
              <option value="">
                Select quarter
              </option>

              {quarters.map(
                (quarter) => (
                  <option
                    key={quarter}
                    value={quarter}
                  >
                    {quarter}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="sha-form-group">
            <label>
              Number of Contracted Facilities
            </label>

            <input
              type="number"
              min="0"
              value={form.value}
              onChange={(event) =>
                updateField(
                  "value",
                  event.target.value
                )
              }
              placeholder="Enter number of facilities"
              required
            />
          </div>

          <div className="sha-form-group">
            <label>Submitted By</label>

            <input
              type="text"
              value={form.submitted_by}
              onChange={(event) =>
                updateField(
                  "submitted_by",
                  event.target.value
                )
              }
              required
            />
          </div>
        </div>

        <div className="sha-form-group full">
          <label>Notes</label>

          <textarea
            value={form.notes}
            onChange={(event) =>
              updateField(
                "notes",
                event.target.value
              )
            }
            placeholder="Optional notes"
          />
        </div>

        <div className="sha-section-title">
          <Upload size={18} />
          <span>Supporting Document</span>
        </div>

        <label className="sha-upload-box">
          <Upload size={30} />

          <span>
            {document
              ? document.name
              : "Choose supporting document"}
          </span>

          <small>
            PDF, XLS or XLSX. Maximum 10 MB.
          </small>

          <input
            type="file"
            hidden
            accept=".pdf,.xls,.xlsx"
            onChange={(event) =>
              handleDocumentChange(
                event.target.files?.[0] ||
                  null
              )
            }
          />
        </label>

        <div className="sha-actions">
          <button
            type="submit"
            disabled={submitting}
          >
            <Send size={18} />

            {submitting
              ? "Submitting..."
              : "Submit Report"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CountySHAReporting;
