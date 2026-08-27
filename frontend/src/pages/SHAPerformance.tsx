import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Download,
  FileText,
  Search,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/api";
import MultiCheckboxFilter from "../components/MultiCheckboxFilter";
import "./SHAPerformance.css";

interface SHADocument {
  id: number;
  name: string;
  url: string;
  content_type?: string;
}

interface SHAFacilityRecord {
  mfl_code: string;
  facility_name: string;
  subcounty_name: string;
  ward_name: string;
  financial_year: string;
  reporting_quarter: string;
  reporting_period: string;
  claims: number;
  reimbursements: number;
  rejections: number;
  supporting_documents: SHADocument[];
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const QUARTER_ORDER: Record<string, number> = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
};

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function compactMoney(value: number) {
  const amount = Number(value || 0);

  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(amount) >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K`;
  }

  return amount.toLocaleString();
}

function withoutAll(values: string[]) {
  return values.filter((value) => value !== "All");
}

function SHAPerformance() {
  const [records, setRecords] = useState<SHAFacilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedFinancialYear, setSelectedFinancialYear] =
    useState<string[]>(["All"]);

  const [selectedQuarter, setSelectedQuarter] =
    useState<string[]>(["All"]);

  const [selectedSubcounty, setSelectedSubcounty] =
    useState<string[]>(["All"]);

  const [selectedFacility, setSelectedFacility] =
    useState<string[]>(["All"]);

  const [search, setSearch] = useState("");

  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewName, setPreviewName] = useState("");

  useEffect(() => {
    api
      .get("/sha-performance/facilities")
      .then((response) => {
        setRecords(response.data?.records || []);
      })
      .catch((error) => {
        console.error(error);
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const financialYears = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(
          records
            .map((record) =>
              String(record.financial_year || "").trim()
            )
            .filter(Boolean)
        )
      ).sort(),
    ];
  }, [records]);

  const subcounties = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(
          records
            .map((record) =>
              String(record.subcounty_name || "").trim()
            )
            .filter(Boolean)
        )
      ).sort(),
    ];
  }, [records]);

  const facilityOptions = useMemo(() => {
    const activeSubcounties = withoutAll(
      selectedSubcounty
    );

    return [
      "All",
      ...Array.from(
        new Set(
          records
            .filter(
              (record) =>
                activeSubcounties.length === 0 ||
                activeSubcounties.includes(
                  record.subcounty_name
                )
            )
            .map(
              (record) =>
                `${record.facility_name} - ${record.mfl_code}`
            )
            .filter(Boolean)
        )
      ).sort(),
    ];
  }, [records, selectedSubcounty]);

  const filteredRecords = useMemo(() => {
    const activeFinancialYears = withoutAll(
      selectedFinancialYear
    );

    const activeQuarters = withoutAll(
      selectedQuarter
    );

    const activeSubcounties = withoutAll(
      selectedSubcounty
    );

    const activeFacilities = withoutAll(
      selectedFacility
    );

    const searchValue = search.trim().toLowerCase();

    return records.filter((record) => {
      const facilityLabel =
        `${record.facility_name} - ${record.mfl_code}`;

      const matchesFinancialYear =
        activeFinancialYears.length === 0 ||
        activeFinancialYears.includes(
          record.financial_year
        );

      const matchesQuarter =
        activeQuarters.length === 0 ||
        activeQuarters.includes(
          record.reporting_quarter
        );

      const matchesSubcounty =
        activeSubcounties.length === 0 ||
        activeSubcounties.includes(
          record.subcounty_name
        );

      const matchesFacility =
        activeFacilities.length === 0 ||
        activeFacilities.includes(
          facilityLabel
        );

      const matchesSearch =
        searchValue === "" ||
        record.facility_name
          ?.toLowerCase()
          .includes(searchValue) ||
        record.mfl_code
          ?.toLowerCase()
          .includes(searchValue) ||
        record.subcounty_name
          ?.toLowerCase()
          .includes(searchValue) ||
        record.ward_name
          ?.toLowerCase()
          .includes(searchValue) ||
        record.reporting_period
          ?.toLowerCase()
          .includes(searchValue);

      return (
        matchesFinancialYear &&
        matchesQuarter &&
        matchesSubcounty &&
        matchesFacility &&
        matchesSearch
      );
    });
  }, [
    records,
    selectedFinancialYear,
    selectedQuarter,
    selectedSubcounty,
    selectedFacility,
    search,
  ]);

  const summary = useMemo(() => {
    const totalClaims = filteredRecords.reduce(
      (sum, record) =>
        sum + Number(record.claims || 0),
      0
    );

    const totalReimbursements = filteredRecords.reduce(
      (sum, record) =>
        sum + Number(record.reimbursements || 0),
      0
    );

    const totalRejections = filteredRecords.reduce(
      (sum, record) =>
        sum + Number(record.rejections || 0),
      0
    );

    const facilitiesSubmitted = new Set(
      filteredRecords.map(
        (record) => record.mfl_code
      )
    ).size;

    const reimbursementRate =
      totalClaims > 0
        ? (
            (totalReimbursements / totalClaims) *
            100
          ).toFixed(1)
        : "0.0";

    const rejectionRate =
      totalClaims > 0
        ? (
            (totalRejections / totalClaims) *
            100
          ).toFixed(1)
        : "0.0";

    return {
      totalClaims,
      totalReimbursements,
      totalRejections,
      facilitiesSubmitted,
      reimbursementRate,
      rejectionRate,
    };
  }, [filteredRecords]);

  const quarterlyTrend = useMemo(() => {
    const grouped = new Map<
      string,
      {
        period: string;
        financial_year: string;
        quarter: string;
        claims: number;
        reimbursements: number;
        rejections: number;
      }
    >();

    filteredRecords.forEach((record) => {
      const key = record.reporting_period;

      if (!grouped.has(key)) {
        grouped.set(key, {
          period: record.reporting_period,
          financial_year:
            record.financial_year,
          quarter:
            record.reporting_quarter,
          claims: 0,
          reimbursements: 0,
          rejections: 0,
        });
      }

      const row = grouped.get(key)!;

      row.claims += Number(
        record.claims || 0
      );

      row.reimbursements += Number(
        record.reimbursements || 0
      );

      row.rejections += Number(
        record.rejections || 0
      );
    });

    return Array.from(grouped.values()).sort(
      (a, b) => {
        const yearDifference =
          a.financial_year.localeCompare(
            b.financial_year
          );

        if (yearDifference !== 0) {
          return yearDifference;
        }

        return (
          (QUARTER_ORDER[a.quarter] || 0) -
          (QUARTER_ORDER[b.quarter] || 0)
        );
      }
    );
  }, [filteredRecords]);

  const subcountyData = useMemo(() => {
    const grouped = new Map<
      string,
      {
        subcounty: string;
        claims: number;
        reimbursements: number;
        rejections: number;
      }
    >();

    filteredRecords.forEach((record) => {
      const subcounty =
        record.subcounty_name || "Unknown";

      if (!grouped.has(subcounty)) {
        grouped.set(subcounty, {
          subcounty,
          claims: 0,
          reimbursements: 0,
          rejections: 0,
        });
      }

      const row = grouped.get(subcounty)!;

      row.claims += Number(
        record.claims || 0
      );

      row.reimbursements += Number(
        record.reimbursements || 0
      );

      row.rejections += Number(
        record.rejections || 0
      );
    });

    return Array.from(grouped.values()).sort(
      (a, b) =>
        b.claims - a.claims
    );
  }, [filteredRecords]);

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

  function downloadCSV() {
    const headers = [
      "Facility",
      "MFL Code",
      "Subcounty",
      "Ward",
      "Financial Year",
      "Quarter",
      "Claims",
      "Reimbursements",
      "Rejections",
    ];

    const rows = filteredRecords.map(
      (record) => [
        record.facility_name,
        record.mfl_code,
        record.subcounty_name,
        record.ward_name,
        record.financial_year,
        record.reporting_quarter,
        record.claims,
        record.reimbursements,
        record.rejections,
      ]
    );

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map(
            (cell) =>
              `"${String(
                cell ?? ""
              ).replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      "facility_sha_performance.csv";

    link.click();

    window.URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="sha-performance-page">
        Loading SHA performance...
      </div>
    );
  }

  return (
    <>
      <div className="sha-performance-page">
        <div className="sha-performance-header">
          <div>
            <h2>SHA Performance</h2>

            <p>
              County visibility of quarterly
              facility SHA claims,
              reimbursements and rejections.
            </p>
          </div>

          <button
            className="sha-download-button"
            type="button"
            onClick={downloadCSV}
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>

        <div className="sha-performance-filters">
          <MultiCheckboxFilter
            label="Financial Year"
            options={financialYears.filter(
              (item) => item !== "All"
            )}
            selected={
              selectedFinancialYear
            }
            onChange={
              setSelectedFinancialYear
            }
          />

          <MultiCheckboxFilter
            label="Quarter"
            options={QUARTERS}
            selected={selectedQuarter}
            onChange={setSelectedQuarter}
          />

          <MultiCheckboxFilter
            label="Subcounty"
            options={subcounties.filter(
              (item) => item !== "All"
            )}
            selected={selectedSubcounty}
            onChange={(values) => {
              setSelectedSubcounty(values);
              setSelectedFacility(["All"]);
            }}
          />

          <MultiCheckboxFilter
            label="Facility"
            options={facilityOptions.filter(
              (item) => item !== "All"
            )}
            selected={selectedFacility}
            onChange={setSelectedFacility}
          />

          <div className="sha-search">
            <label>Search</label>

            <div>
              <Search size={17} />

              <input
                type="text"
                placeholder="Facility, MFL, ward..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
            </div>
          </div>
        </div>

        <div className="sha-performance-kpis">
          <div className="sha-performance-kpi">
            <div>
              <span>Total SHA Claims</span>
              <strong>
                {money(
                  summary.totalClaims
                )}
              </strong>
              <small>
                Filtered facility submissions
              </small>
            </div>

            <BarChart3 size={24} />
          </div>

          <div className="sha-performance-kpi">
            <div>
              <span>
                Total Reimbursements
              </span>

              <strong>
                {money(
                  summary.totalReimbursements
                )}
              </strong>

              <small>
                {summary.reimbursementRate}%
                of claims
              </small>
            </div>

            <Wallet size={24} />
          </div>

          <div className="sha-performance-kpi">
            <div>
              <span>Total Rejections</span>

              <strong>
                {money(
                  summary.totalRejections
                )}
              </strong>

              <small>
                {summary.rejectionRate}% of
                claims
              </small>
            </div>

            <FileText size={24} />
          </div>

          <div className="sha-performance-kpi">
            <div>
              <span>
                Facilities Submitted
              </span>

              <strong>
                {
                  summary.facilitiesSubmitted
                }
              </strong>

              <small>
                Facilities represented in
                current filter
              </small>
            </div>

            <Building2 size={24} />
          </div>
        </div>

        <div className="sha-performance-chart-grid">
          <div className="sha-performance-chart-card">
            <h3>
              Quarterly SHA Financial Trend
            </h3>

            <ResponsiveContainer
              width="100%"
              height={330}
            >
              <LineChart
                data={quarterlyTrend}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="period"
                />

                <YAxis
                  tickFormatter={
                    compactMoney
                  }
                />

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

          <div className="sha-performance-chart-card">
            <h3>
              SHA Performance by Subcounty
            </h3>

            <ResponsiveContainer
              width="100%"
              height={330}
            >
              <BarChart
                data={subcountyData}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="subcounty"
                />

                <YAxis
                  tickFormatter={
                    compactMoney
                  }
                />

                <Tooltip
                  formatter={(value) =>
                    money(Number(value))
                  }
                />

                <Legend />

                <Bar
                  dataKey="claims"
                  name="Claims"
                />

                <Bar
                  dataKey="reimbursements"
                  name="Reimbursements"
                />

                <Bar
                  dataKey="rejections"
                  name="Rejections"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sha-performance-table-card">
          <div className="sha-table-heading">
            <div>
              <h3>
                Facility SHA Submissions
              </h3>

              <p>
                {filteredRecords.length}{" "}
                quarterly submission
                {filteredRecords.length === 1
                  ? ""
                  : "s"}
              </p>
            </div>
          </div>

          <div className="sha-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>MFL</th>
                  <th>Subcounty</th>
                  <th>Financial Year</th>
                  <th>Quarter</th>
                  <th>Claims</th>
                  <th>Reimbursements</th>
                  <th>Rejections</th>
                  <th>Evidence</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map(
                  (record) => (
                    <tr
                      key={`${record.mfl_code}-${record.reporting_period}`}
                    >
                      <td>
                        {record.facility_name ||
                          "—"}
                      </td>

                      <td>
                        {record.mfl_code}
                      </td>

                      <td>
                        {record.subcounty_name ||
                          "—"}
                      </td>

                      <td>
                        {record.financial_year}
                      </td>

                      <td>
                        {
                          record.reporting_quarter
                        }
                      </td>

                      <td>
                        {money(record.claims)}
                      </td>

                      <td>
                        {money(
                          record.reimbursements
                        )}
                      </td>

                      <td>
                        {money(
                          record.rejections
                        )}
                      </td>

                      <td>
                        {record
                          .supporting_documents
                          ?.length ? (
                          <div className="sha-evidence-list">
                            {record.supporting_documents.map(
                              (
                                document
                              ) => (
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
                                    size={
                                      15
                                    }
                                  />
                                  {
                                    document.name
                                  }
                                </button>
                              )
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  )
                )}

                {filteredRecords.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="sha-empty"
                    >
                      No facility SHA data
                      matches the selected
                      filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previewUrl && (
        <div
          className="sha-preview-overlay"
          onClick={closePreview}
        >
          <div
            className="sha-preview-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="sha-preview-header">
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

export default SHAPerformance;
