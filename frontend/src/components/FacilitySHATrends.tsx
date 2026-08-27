import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileText } from "lucide-react";
import api from "../api/api";
import "./FacilitySHATrends.css";

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
  supporting_documents?: SHADocument[];
}

interface TrendRow {
  reporting_period: string;
  claims: number;
  reimbursements: number;
  rejections: number;
  documents: SHADocument[];
}

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function periodRank(period: string) {
  const match = String(period || "").match(
    /^(\d{4})\/(\d{4})\s+(Q[1-4])$/
  );

  if (!match) return 0;

  const startYear = Number(match[1]);

  const quarterOrder: Record<string, number> = {
    Q1: 1,
    Q2: 2,
    Q3: 3,
    Q4: 4,
  };

  return (
    startYear * 10 +
    (quarterOrder[match[3]] || 0)
  );
}

function FacilitySHATrends() {
  const user = JSON.parse(
    sessionStorage.getItem("hpt_user") || "{}"
  );

  const [reports, setReports] =
    useState<SHAReport[]>([]);

  const [previewUrl, setPreviewUrl] =
    useState("");

  const [previewType, setPreviewType] =
    useState("");

  const [previewName, setPreviewName] =
    useState("");

  useEffect(() => {
    if (user?.role !== "facility") {
      return;
    }

    api
      .get("/facility-sha-reports")
      .then((response) => {
        setReports(response.data || []);
      })
      .catch((error) => {
        console.error(
          "Failed to load facility SHA trends:",
          error
        );
      });
  }, []);

  const trendData = useMemo<TrendRow[]>(() => {
    const grouped = new Map<string, TrendRow>();

    reports.forEach((report) => {
      const period =
        report.reporting_period || "Unknown";

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

      if (
        report.report_type ===
        "SHA Reimbursements"
      ) {
        row.reimbursements = Number(
          report.value || 0
        );
      }

      if (
        report.report_type ===
        "SHA Rejections"
      ) {
        row.rejections = Number(
          report.value || 0
        );
      }

      (
        report.supporting_documents || []
      ).forEach((document) => {
        if (
          !row.documents.some(
            (existing) =>
              existing.id === document.id
          )
        ) {
          row.documents.push(document);
        }
      });
    });

    return Array.from(grouped.values()).sort(
      (a, b) =>
        periodRank(a.reporting_period) -
        periodRank(b.reporting_period)
    );
  }, [reports]);

  const latest =
    trendData.length > 0
      ? trendData[trendData.length - 1]
      : undefined;

  function closePreview() {
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl("");
    setPreviewType("");
    setPreviewName("");
  }

  async function openDocument(
    document: SHADocument
  ) {
    try {
      closePreview();

      const response = await api.get(
        document.url,
        {
          responseType: "blob",
        }
      );

      const contentType = String(
        response.headers["content-type"] ||
          document.content_type ||
          "application/pdf"
      );

      const blob = new Blob(
        [response.data],
        {
          type: contentType,
        }
      );

      setPreviewUrl(
        URL.createObjectURL(blob)
      );

      setPreviewType(contentType);
      setPreviewName(document.name);
    } catch (error) {
      console.error(error);
      alert(
        "Unable to open SHA supporting evidence."
      );
    }
  }

  if (user?.role !== "facility") {
    return null;
  }

  return (
    <>
      <div className="facility-sha-trends-card">
        <div className="facility-sha-trends-heading">
          <h3>SHA Performance Trend</h3>

          <p>
            Quarterly SHA claims,
            reimbursements and rejections
            submitted by this facility.
          </p>
        </div>

        <div className="facility-sha-trends-kpis">
          <div>
            <span>Latest Claims</span>
            <strong>
              {money(latest?.claims || 0)}
            </strong>
          </div>

          <div>
            <span>
              Latest Reimbursements
            </span>

            <strong>
              {money(
                latest?.reimbursements || 0
              )}
            </strong>
          </div>

          <div>
            <span>Latest Rejections</span>

            <strong>
              {money(
                latest?.rejections || 0
              )}
            </strong>
          </div>
        </div>

        <div className="facility-sha-trends-chart">
          <ResponsiveContainer
            width="100%"
            height={320}
          >
            <LineChart data={trendData}>
              <CartesianGrid
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="reporting_period"
              />

              <YAxis />

              <Tooltip
                formatter={(value) =>
                  money(Number(value))
                }
              />

              <Legend />

              <Line
                type="monotone"
                dataKey="claims"
                name="Claims"
              />

              <Line
                type="monotone"
                dataKey="reimbursements"
                name="Reimbursements"
              />

              <Line
                type="monotone"
                dataKey="rejections"
                name="Rejections"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="facility-sha-trends-card">
        <h3>SHA Quarterly History</h3>

        <div className="facility-sha-trends-table">
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
              {trendData.map((row) => (
                <tr
                  key={
                    row.reporting_period
                  }
                >
                  <td>
                    {row.reporting_period}
                  </td>

                  <td>
                    {money(row.claims)}
                  </td>

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
                      <div className="facility-sha-trend-documents">
                        {row.documents.map(
                          (document) => (
                            <button
                              key={
                                document.id
                              }
                              type="button"
                              onClick={() =>
                                openDocument(
                                  document
                                )
                              }
                            >
                              <FileText
                                size={15}
                              />

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

              {trendData.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    No SHA submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewUrl && (
        <div
          className="facility-sha-trend-preview-overlay"
          onClick={closePreview}
        >
          <div
            className="facility-sha-trend-preview"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="facility-sha-trend-preview-header">
              <strong>
                {previewName}
              </strong>

              <button
                type="button"
                onClick={closePreview}
              >
                Close
              </button>
            </div>

            {previewType.startsWith(
              "image/"
            ) ? (
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

export default FacilitySHATrends;
