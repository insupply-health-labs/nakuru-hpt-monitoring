import { useEffect, useMemo, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import api from "../api/api";
import "./FacilitySHASection.css";

interface SHADocument {
  id: number;
  name: string;
  url: string;
  content_type?: string;
}

interface SHAReport {
  report_id: string;
  report_type: string;
  reporting_period: string;
  value: number;
  notes?: string;
  supporting_documents?: SHADocument[];
}

const quarters = ["Q1", "Q2", "Q3", "Q4"];

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatAmount(value: string) {
  const raw = value
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");

  if (!raw) return "";

  const parts = raw.split(".");
  const whole = parts[0] || "0";
  const decimal = parts.slice(1).join("");

  const formattedWhole = Number(whole).toLocaleString();

  return raw.includes(".")
    ? `${formattedWhole}.${decimal}`
    : formattedWhole;
}

function numericAmount(value: string) {
  return value.replace(/,/g, "") || "0";
}

function FacilitySHASection() {
  const currentYear = new Date().getFullYear();

  const financialYears = Array.from(
    { length: 6 },
    (_, index) => {
      const start = currentYear + index;
      return `${start}/${start + 1}`;
    }
  );

  const [form, setForm] = useState({
    financial_year: `${currentYear}/${currentYear + 1}`,
    reporting_quarter: "",
    claims_amount: "",
    reimbursements_amount: "",
    rejections_amount: "",
    notes: "",
  });

  const [documents, setDocuments] = useState<File[]>([]);
  const [reports, setReports] = useState<SHAReport[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewName, setPreviewName] = useState("");

  async function loadReports() {
    try {
      const response = await api.get(
        "/facility-sha-reports"
      );

      setReports(response.data || []);
    } catch (error) {
      console.error(
        "Failed to load facility SHA reports:",
        error
      );
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  const history = useMemo(() => {
    const grouped = new Map<
      string,
      {
        reporting_period: string;
        claims: number;
        reimbursements: number;
        rejections: number;
        documents: SHADocument[];
      }
    >();

    reports.forEach((report) => {
      const period = report.reporting_period || "Unknown";

      if (!grouped.has(period)) {
        grouped.set(period, {
          reporting_period: period,
          claims: 0,
          reimbursements: 0,
          rejections: 0,
          documents: [],
        });
      }

      const row = grouped.get(period)!;

      if (report.report_type === "SHA Claims") {
        row.claims = Number(report.value || 0);
      }

      if (report.report_type === "SHA Reimbursements") {
        row.reimbursements = Number(report.value || 0);
      }

      if (report.report_type === "SHA Rejections") {
        row.rejections = Number(report.value || 0);
      }

      (report.supporting_documents || []).forEach(
        (document) => {
          if (
            !row.documents.some(
              (existing) => existing.id === document.id
            )
          ) {
            row.documents.push(document);
          }
        }
      );
    });

    return Array.from(grouped.values());
  }, [reports]);

  function closePreview() {
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl("");
    setPreviewType("");
    setPreviewName("");
  }

  function addDocuments(files: FileList | null) {
    if (!files) return;

    const allowed = [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
    ];

    const newFiles = Array.from(files);

    for (const file of newFiles) {
      const lowerName = file.name.toLowerCase();

      if (
        !allowed.some((extension) =>
          lowerName.endsWith(extension)
        )
      ) {
        alert(
          "Only PDF, JPG, JPEG and PNG files are allowed."
        );
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert(
          `${file.name} exceeds the 10 MB limit.`
        );
        return;
      }
    }

    setDocuments((current) => [
      ...current,
      ...newFiles,
    ]);
  }

  function previewLocalFile(file: File) {
    closePreview();

    setPreviewUrl(URL.createObjectURL(file));
    setPreviewType(file.type);
    setPreviewName(file.name);
  }

  async function previewSavedDocument(
    document: SHADocument
  ) {
    try {
      closePreview();

      const response = await api.get(document.url, {
        responseType: "blob",
      });

      const contentType = String(
        response.headers["content-type"] ||
          document.content_type ||
          "application/pdf"
      );

      const blob = new Blob([response.data], {
        type: contentType,
      });

      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewType(contentType);
      setPreviewName(document.name);
    } catch (error) {
      console.error(error);
      alert("Unable to open SHA evidence file.");
    }
  }

  async function submitSHA(
    event: React.FormEvent
  ) {
    event.preventDefault();

    if (!form.reporting_quarter) {
      alert("Please select a reporting quarter.");
      return;
    }

    const data = new FormData();

    data.append(
      "financial_year",
      form.financial_year
    );

    data.append(
      "reporting_quarter",
      form.reporting_quarter
    );

    data.append(
      "claims_amount",
      numericAmount(form.claims_amount)
    );

    data.append(
      "reimbursements_amount",
      numericAmount(form.reimbursements_amount)
    );

    data.append(
      "rejections_amount",
      numericAmount(form.rejections_amount)
    );

    data.append("notes", form.notes);

    documents.forEach((file) => {
      data.append(
        "supporting_documents",
        file
      );
    });

    try {
      setSubmitting(true);

      await api.post(
        "/facility-sha-reports",
        data
      );

      alert(
        "Quarterly SHA data submitted successfully."
      );

      setForm({
        financial_year:
          `${currentYear}/${currentYear + 1}`,
        reporting_quarter: "",
        claims_amount: "",
        reimbursements_amount: "",
        rejections_amount: "",
        notes: "",
      });

      setDocuments([]);

      await loadReports();
    } catch (error: any) {
      console.error(error);

      alert(
        error?.response?.data?.detail ||
          "Failed to submit SHA data."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="facility-sha-card">
        <div className="facility-sha-heading">
          <h3>Quarterly SHA Data</h3>

          <p>
            Enter SHA claims, reimbursements and
            rejections for the selected reporting period.
          </p>
        </div>

        <form onSubmit={submitSHA}>
          <div className="facility-sha-grid">
            <div>
              <label>Financial Year</label>

              <select
                value={form.financial_year}
                onChange={(event) =>
                  setForm({
                    ...form,
                    financial_year:
                      event.target.value,
                  })
                }
                required
              >
                {financialYears.map(
                  (financialYear) => (
                    <option
                      key={financialYear}
                      value={financialYear}
                    >
                      {financialYear}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label>Quarter</label>

              <select
                value={form.reporting_quarter}
                onChange={(event) =>
                  setForm({
                    ...form,
                    reporting_quarter:
                      event.target.value,
                  })
                }
                required
              >
                <option value="">
                  Select quarter
                </option>

                {quarters.map((quarter) => (
                  <option
                    key={quarter}
                    value={quarter}
                  >
                    {quarter}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="facility-sha-amount-grid">
            <div className="facility-sha-amount-box">
              <label>SHA Claims</label>

              <input
                type="text"
                inputMode="decimal"
                placeholder="KES 0.00"
                value={form.claims_amount}
                onChange={(event) =>
                  setForm({
                    ...form,
                    claims_amount: formatAmount(
                      event.target.value
                    ),
                  })
                }
              />
            </div>

            <div className="facility-sha-amount-box">
              <label>SHA Reimbursements</label>

              <input
                type="text"
                inputMode="decimal"
                placeholder="KES 0.00"
                value={form.reimbursements_amount}
                onChange={(event) =>
                  setForm({
                    ...form,
                    reimbursements_amount:
                      formatAmount(
                        event.target.value
                      ),
                  })
                }
              />
            </div>

            <div className="facility-sha-amount-box">
              <label>SHA Rejections</label>

              <input
                type="text"
                inputMode="decimal"
                placeholder="KES 0.00"
                value={form.rejections_amount}
                onChange={(event) =>
                  setForm({
                    ...form,
                    rejections_amount:
                      formatAmount(
                        event.target.value
                      ),
                  })
                }
              />
            </div>
          </div>

          <div className="facility-sha-notes">
            <label>Notes</label>

            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm({
                  ...form,
                  notes: event.target.value,
                })
              }
              placeholder="Optional notes..."
            />
          </div>

          <label className="facility-sha-upload">
            <Upload size={24} />

            <strong>
              Add Supporting Evidence
            </strong>

            <span>
              Multiple PDF, JPG, JPEG or PNG files.
              Maximum 10 MB per file.
            </span>

            <input
              hidden
              multiple
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(event) => {
                addDocuments(
                  event.target.files
                );

                event.target.value = "";
              }}
            />
          </label>

          {documents.length > 0 && (
            <div className="facility-sha-files">
              {documents.map(
                (file, index) => (
                  <div
                    className="facility-sha-file"
                    key={`${file.name}-${index}`}
                  >
                    <FileText size={17} />

                    <span>{file.name}</span>

                    <button
                      type="button"
                      onClick={() =>
                        previewLocalFile(file)
                      }
                    >
                      View
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDocuments(
                          (current) =>
                            current.filter(
                              (_, fileIndex) =>
                                fileIndex !==
                                index
                            )
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          <div className="facility-sha-actions">
            <button
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Submitting..."
                : "Submit SHA Data"}
            </button>
          </div>
        </form>
      </div>

      <div className="facility-sha-card">
        <h3>SHA Submission History</h3>

        <div className="facility-sha-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reporting Period</th>
                <th>Claims</th>
                <th>Reimbursements</th>
                <th>Rejections</th>
                <th>Evidence</th>
              </tr>
            </thead>

            <tbody>
              {history.map((row) => (
                <tr key={row.reporting_period}>
                  <td>
                    {row.reporting_period}
                  </td>

                  <td>{money(row.claims)}</td>

                  <td>
                    {money(
                      row.reimbursements
                    )}
                  </td>

                  <td>
                    {money(row.rejections)}
                  </td>

                  <td>
                    {row.documents.length ? (
                      <div className="facility-sha-doc-list">
                        {row.documents.map(
                          (document) => (
                            <button
                              key={document.id}
                              type="button"
                              onClick={() =>
                                previewSavedDocument(
                                  document
                                )
                              }
                            >
                              {document.name}
                            </button>
                          )
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}

              {history.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    No SHA submissions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewUrl && (
        <div
          className="facility-sha-preview-overlay"
          onClick={closePreview}
        >
          <div
            className="facility-sha-preview"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="facility-sha-preview-header">
              <strong>{previewName}</strong>

              <button
                type="button"
                onClick={closePreview}
              >
                Close
              </button>
            </div>

            {previewType.startsWith("image/") ? (
              <img
                src={previewUrl}
                alt={previewName}
              />
            ) : (
              <iframe
                src={previewUrl}
                title={previewName}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default FacilitySHASection;
