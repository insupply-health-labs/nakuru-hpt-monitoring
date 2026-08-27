import { useEffect, useState } from "react";
import {
  Wallet,
  Download,
  Package,
  Percent,
  ShieldCheck,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import api from "../api/api";
import "./Dashboard.css";
import MultiCheckboxFilter from "../components/MultiCheckboxFilter";

interface Summary {
  total_amount_received: number;
  total_hpt_allocated: number;
  total_hpt_spent: number;
  total_balance: number;
  average_hpt_percent: number;
  required_hpt_percent: number;
  total_facilities_submitted: number;
  compliant_facilities: number;
  non_compliant_facilities: number;
  total_chp_kits_used: number;
  required_chp_kits_amount: number;
  chp_kits_percent_of_hpt: number;
  required_chp_kits_percent_of_hpt: number;
  chp_kits_compliant_facilities: number;
  chp_kits_below_target_facilities: number;
}

interface FacilityCompliance {
  mfl_code: string;
  facility_name: string;
  subcounty_name: string;
  ward_name: string;
  funding_source: string;
  amount_received: number;
  hpt_allocated: number;
  hpt_spent: number;
  balance: number;
  hpt_percent: number;
  required_hpt_percent: number;
  compliance_status: string;
  amount_used_for_chp_kits: number;
  required_chp_kits_amount: number;
  chp_kits_percent_of_hpt: number;
  required_chp_kits_percent_of_hpt: number;
  chp_kits_status: string;
  reporting_period: string;
  financial_year?: string;
  reporting_quarter?: string;
}

const FUNDING_SOURCE_OPTIONS = [
  "County Allocation",
  "FIF",
  "SHIF",
  "PHC",
  "Partners",
  "Donations",
];

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const MONTH_ORDER: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function money(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function normalizeMflCode(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
}

function withoutAll(values: string[]) {
  return values.filter((value) => value !== "All");
}

function parseReportingPeriod(period: string) {
  const parts = String(period || "")
    .trim()
    .split("-");

  if (parts.length !== 2) {
    return { month: "", year: "" };
  }

  const [first, second] = parts;

  if (/^\d{4}$/.test(first)) {
    return { year: first, month: second };
  }

  return { month: first, year: second };
}

function getReportingPeriodRank(period?: string) {
  const text = String(period || "").trim();

  const quarterlyMatch = text.match(
    /^(\d{4})\/(\d{4})\s+(Q[1-4])$/
  );

  if (quarterlyMatch) {
    const startYear = Number(quarterlyMatch[1]);
    const endYear = Number(quarterlyMatch[2]);
    const quarter = quarterlyMatch[3];

    const ranks: Record<string, number> = {
      Q1: startYear * 100 + 7,
      Q2: startYear * 100 + 10,
      Q3: endYear * 100 + 1,
      Q4: endYear * 100 + 4,
    };

    return ranks[quarter] || 0;
  }

  const { month, year } = parseReportingPeriod(text);

  return Number(year || 0) * 100 + Number(MONTH_ORDER[month] || 0);
}

function getFacilityPeriod(facility: FacilityCompliance) {
  if (facility.financial_year && facility.reporting_quarter) {
    return `${facility.financial_year} ${facility.reporting_quarter}`;
  }

  return facility.reporting_period || "Unknown";
}

function matchesFundingSource(
  fundingSource: string,
  selectedSources: string[]
) {
  if (selectedSources.length === 0) {
    return true;
  }

  const sourceText = String(fundingSource || "").toLowerCase();

  return selectedSources.some((source) => {
    const normalizedSource = source.toLowerCase();

    if (normalizedSource === "partners") {
      return sourceText.includes("partner");
    }

    if (normalizedSource === "donations") {
      return (
        sourceText.includes("donor") ||
        sourceText.includes("donation")
      );
    }

    return sourceText.includes(normalizedSource);
  });
}

function getFundingChartCategory(fundingSource: string): string | null {
  const sourceText = String(fundingSource || "").toLowerCase();

  if (sourceText.includes("county allocation")) return "County Allocation";
  if (sourceText.includes("fif")) return "FIF";
  if (sourceText.includes("shif")) return "SHIF";
  if (sourceText.includes("phc")) return "PHC";
  if (sourceText.includes("partner")) return "Partners";

  if (
    sourceText.includes("donor") ||
    sourceText.includes("donation")
  ) {
    return "Donations";
  }

  return null;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
}) {
  return (
    <div className="kpi-card">
      <div>
        <p>{title}</p>
        <h3>{value}</h3>
        <span>{subtitle}</span>
      </div>

      <div className="kpi-icon">
        <Icon size={22} />
      </div>
    </div>
  );
}

function CountyDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [facilities, setFacilities] = useState<FacilityCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [selectedSubcounty, setSelectedSubcounty] = useState<string[]>([
    "All",
  ]);
  const [selectedWard, setSelectedWard] = useState<string[]>(["All"]);
  const [selectedFacility, setSelectedFacility] = useState<string[]>([
    "All",
  ]);
  const [selectedFinancialYear, setSelectedFinancialYear] =
    useState<string[]>(["All"]);
  const [selectedQuarter, setSelectedQuarter] =
    useState<string[]>(["All"]);
  const [selectedFundingSource, setSelectedFundingSource] = useState<
    string[]
  >(["All"]);
  const [searchTerm, setSearchTerm] = useState("");

  const rowsPerPage = 10;

  useEffect(() => {
    setLoading(true);

    api
      .get(
        "/dashboard/county?reporting_periods=All&subcounties=All&funding_sources=All"
      )
      .then((res) => {
        setSummary(res.data.summary);
        setFacilities(res.data.facility_compliance || []);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (!summary) {
    return <div>No dashboard data found.</div>;
  }

  const subcounties = [
    "All",
    ...Array.from(
      new Set(
        facilities
          .map((facility) => facility.subcounty_name)
          .filter((name) => name && name.trim() !== "")
      )
    ).sort((a, b) => a.localeCompare(b)),
  ];

  const facilitiesBySubcounty = facilities.filter(
    (facility) =>
      selectedSubcounty.includes("All") ||
      selectedSubcounty.length === 0 ||
      selectedSubcounty.includes(facility.subcounty_name)
  );

  const wards = [
    "All",
    ...Array.from(
      new Set(
        facilitiesBySubcounty
          .map((facility) => facility.ward_name)
          .filter((name) => name && name.trim() !== "")
      )
    ).sort((a, b) => a.localeCompare(b)),
  ];

  const facilitiesByWard = facilitiesBySubcounty.filter(
    (facility) =>
      selectedWard.includes("All") ||
      selectedWard.length === 0 ||
      selectedWard.includes(facility.ward_name)
  );

  const facilityOptions = [
    "All",
    ...Array.from(
      new Set(
        facilitiesByWard
          .map((facility) => {
            const mflCode = normalizeMflCode(facility.mfl_code);
            return `${facility.facility_name} - ${mflCode}`;
          })
          .filter((name) => name && name.trim() !== "")
      )
    ).sort((a, b) => a.localeCompare(b)),
  ];

  const financialYears = [
    "All",
    ...Array.from(
      new Set(
        facilities
          .map((facility) =>
            String(facility.financial_year || "").trim()
          )
          .filter(Boolean)
      )
    ).sort(),
  ];

  const activeSubcounties = withoutAll(selectedSubcounty);
  const activeWards = withoutAll(selectedWard);
  const activeFacilities = withoutAll(selectedFacility);
  const activeFinancialYears = withoutAll(selectedFinancialYear);
  const activeQuarters = withoutAll(selectedQuarter);
  const activeFundingSources = withoutAll(selectedFundingSource);

  const filteredFacilities = facilities.filter((facility) => {
    const mflCode = normalizeMflCode(facility.mfl_code);
    const facilityLabel = `${facility.facility_name} - ${mflCode}`;
    const fundingSourceText = String(
      facility.funding_source || ""
    ).toLowerCase();
    const searchValue = searchTerm.trim().toLowerCase();

    const matchesSubcounty =
      activeSubcounties.length === 0 ||
      activeSubcounties.includes(facility.subcounty_name);

    const matchesWard =
      activeWards.length === 0 || activeWards.includes(facility.ward_name);

    const matchesFacility =
      activeFacilities.length === 0 ||
      activeFacilities.includes(facilityLabel);

    const matchesFinancialYear =
      activeFinancialYears.length === 0 ||
      activeFinancialYears.includes(
        String(facility.financial_year || "")
      );

    const matchesQuarter =
      activeQuarters.length === 0 ||
      activeQuarters.includes(
        String(facility.reporting_quarter || "")
      );

    const matchesFunding = matchesFundingSource(
      facility.funding_source,
      activeFundingSources
    );

    const matchesSearch =
      searchValue === "" ||
      String(facility.facility_name || "")
        .toLowerCase()
        .includes(searchValue) ||
      mflCode.toLowerCase().includes(searchValue) ||
      String(facility.subcounty_name || "")
        .toLowerCase()
        .includes(searchValue) ||
      String(facility.ward_name || "")
        .toLowerCase()
        .includes(searchValue) ||
      String(facility.reporting_period || "")
        .toLowerCase()
        .includes(searchValue) ||
      fundingSourceText.includes(searchValue);

    return (
      matchesSubcounty &&
      matchesWard &&
      matchesFacility &&
      matchesFinancialYear &&
      matchesQuarter &&
      matchesFunding &&
      matchesSearch
    );
  });

  const latestFacilityMap = new Map<string, FacilityCompliance>();

  filteredFacilities.forEach((facility) => {
    const mflCode = normalizeMflCode(facility.mfl_code);
    const facilityKey = mflCode || String(facility.facility_name || "");
    const currentRecord = latestFacilityMap.get(facilityKey);

    if (
      !currentRecord ||
      getReportingPeriodRank(getFacilityPeriod(facility)) >
        getReportingPeriodRank(getFacilityPeriod(currentRecord))
    ) {
      latestFacilityMap.set(facilityKey, facility);
    }
  });

  const latestFacilityRecords = Array.from(latestFacilityMap.values());
  const submittedFacilityCount = latestFacilityRecords.length;
  const facilityComplianceDenominator = submittedFacilityCount || 1;
  const submissionCount = filteredFacilities.length;
  const submissionComplianceDenominator = submissionCount || 1;

  const filteredSummary = {
    total_amount_received: filteredFacilities.reduce(
      (sum, facility) => sum + Number(facility.amount_received || 0),
      0
    ),

    total_hpt_allocated: filteredFacilities.reduce(
      (sum, facility) => sum + Number(facility.hpt_allocated || 0),
      0
    ),

    total_hpt_spent: filteredFacilities.reduce(
      (sum, facility) => sum + Number(facility.hpt_spent || 0),
      0
    ),

    total_chp_kits_used: filteredFacilities.reduce(
      (sum, facility) =>
        sum + Number(facility.amount_used_for_chp_kits || 0),
      0
    ),

    compliant_facilities: latestFacilityRecords.filter(
      (facility) => facility.compliance_status === "Compliant"
    ).length,

    non_compliant_facilities: latestFacilityRecords.filter(
      (facility) => facility.compliance_status === "Non-Compliant"
    ).length,

    compliant_submissions: filteredFacilities.filter(
      (facility) => facility.compliance_status === "Compliant"
    ).length,

    non_compliant_submissions: filteredFacilities.filter(
      (facility) => facility.compliance_status === "Non-Compliant"
    ).length,
  };

  const filteredHptPercent =
    filteredSummary.total_amount_received > 0
      ? (
          (filteredSummary.total_hpt_allocated /
            filteredSummary.total_amount_received) *
          100
        ).toFixed(2)
      : "0.00";

  const filteredHptUtilization =
    filteredSummary.total_hpt_allocated > 0
      ? (
          (filteredSummary.total_hpt_spent /
            filteredSummary.total_hpt_allocated) *
          100
        ).toFixed(1)
      : "0.0";

  const filteredChpPercent =
    filteredSummary.total_hpt_allocated > 0
      ? (
          (filteredSummary.total_chp_kits_used /
            filteredSummary.total_hpt_allocated) *
          100
        ).toFixed(2)
      : "0.00";

  const fundingSourceChartData = Object.values(
    filteredFacilities.reduce(
      (
        acc: Record<string, Record<string, string | number>>,
        facility
      ) => {
        const period = getFacilityPeriod(facility);

        if (!acc[period]) {
          acc[period] = { reporting_period: period };
        }

        const category = getFundingChartCategory(facility.funding_source);

        if (category) {
          acc[period][category] =
            Number(acc[period][category] || 0) +
            Number(facility.amount_received || 0);
        }

        return acc;
      },
      {}
    )
  ).sort((a: any, b: any) => {
    return (
      getReportingPeriodRank(a.reporting_period) -
      getReportingPeriodRank(b.reporting_period)
    );
  });

  const hptAllocationChartData = Object.values(
    filteredFacilities.reduce(
      (
        acc: Record<
          string,
          {
            reporting_period: string;
            amount_received: number;
            hpt_allocated: number;
            hpt_spent: number;
            chp_kits_used: number;
          }
        >,
        facility
      ) => {
        const period = getFacilityPeriod(facility);

        if (!acc[period]) {
          acc[period] = {
            reporting_period: period,
            amount_received: 0,
            hpt_allocated: 0,
            hpt_spent: 0,
            chp_kits_used: 0,
          };
        }

        acc[period].amount_received += Number(
          facility.amount_received || 0
        );
        acc[period].hpt_allocated += Number(facility.hpt_allocated || 0);
        acc[period].hpt_spent += Number(facility.hpt_spent || 0);
        acc[period].chp_kits_used += Number(
          facility.amount_used_for_chp_kits || 0
        );

        return acc;
      },
      {}
    )
  ).sort((a, b) => {
    return (
      getReportingPeriodRank(a.reporting_period) -
      getReportingPeriodRank(b.reporting_period)
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredFacilities.length / rowsPerPage)
  );

  const paginatedFacilities = filteredFacilities.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  function downloadCSV() {
    const headers = [
      "Facility",
      "MFL Code",
      "Subcounty",
      "Ward",
      "Reporting Period",
      "Funding Source",
      "Amount Received",
      "HPT Allocated",
      "HPT Spent",
      "HPT %",
      "HPT Status",
      "CHP Kits Amount",
    ];

    const rows = filteredFacilities.map((facility) => [
      facility.facility_name,
      normalizeMflCode(facility.mfl_code),
      facility.subcounty_name,
      facility.ward_name,
      facility.reporting_period,
      facility.funding_source,
      facility.amount_received,
      facility.hpt_allocated,
      facility.hpt_spent,
      facility.hpt_percent,
      facility.compliance_status,
      facility.amount_used_for_chp_kits,
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
    link.download = "facility_compliance.csv";
    link.click();

    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <h2>County Dashboard</h2>
        <p>Facility-level HPT compliance visibility.</p>
      </div>

      <div className="dashboard-filters">
        <MultiCheckboxFilter
          label="Subcounty"
          options={subcounties.filter((item) => item !== "All")}
          selected={selectedSubcounty}
          onChange={(values) => {
            setSelectedSubcounty(values);
            setSelectedWard(["All"]);
            setSelectedFacility(["All"]);
            setPage(1);
          }}
        />

        <MultiCheckboxFilter
          label="Ward"
          options={wards.filter((item) => item !== "All")}
          selected={selectedWard}
          onChange={(values) => {
            setSelectedWard(values);
            setSelectedFacility(["All"]);
            setPage(1);
          }}
        />

        <MultiCheckboxFilter
          label="Facility"
          options={facilityOptions.filter((item) => item !== "All")}
          selected={selectedFacility}
          onChange={(values) => {
            setSelectedFacility(values);
            setPage(1);
          }}
        />

        <MultiCheckboxFilter
          label="Financial Year"
          options={financialYears.filter((item) => item !== "All")}
          selected={selectedFinancialYear}
          onChange={(values) => {
            setSelectedFinancialYear(values);
            setPage(1);
          }}
        />

        <MultiCheckboxFilter
          label="Quarter"
          options={QUARTERS}
          selected={selectedQuarter}
          onChange={(values) => {
            setSelectedQuarter(values);
            setPage(1);
          }}
        />

        <MultiCheckboxFilter
          label="Funding Source"
          options={FUNDING_SOURCE_OPTIONS}
          selected={selectedFundingSource}
          onChange={(values) => {
            setSelectedFundingSource(values);
            setPage(1);
          }}
        />

        <div className="dashboard-search">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search facility, MFL, ward, subcounty"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Total Funds Received"
          value={money(filteredSummary.total_amount_received)}
          subtitle={`${submittedFacilityCount} ${
            submittedFacilityCount === 1 ? "facility" : "facilities"
          } submitted`}
          icon={Wallet}
        />

        <KpiCard
          title="Total HPT Allocation"
          value={money(filteredSummary.total_hpt_allocated)}
          subtitle={`${filteredHptPercent}% of total received`}
          icon={Percent}
        />

        <KpiCard
          title="Total HPT Expenditure"
          value={money(filteredSummary.total_hpt_spent)}
          subtitle={`${filteredHptUtilization}% of HPT allocated`}
          icon={ShieldCheck}
        />

        <KpiCard
          title="CHP Kits Support"
          value={money(filteredSummary.total_chp_kits_used)}
          subtitle={`${filteredChpPercent}% of HPT allocation`}
          icon={Package}
        />
      </div>

      <div className="dashboard-analysis-grid">
        <div className="compliance-stack">
          <div className="chart-card">
            <h3>HPT Facility Compliance Status</h3>

            <div className="compliance-bars">
              <div className="compliance-row">
                <div>
                  <strong>Compliant Facilities</strong>
                  <span>
                    Latest filtered submission meets the 40% requirement
                  </span>
                </div>
                <b>{filteredSummary.compliant_facilities}</b>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill green"
                  style={{
                    width: `${
                      (filteredSummary.compliant_facilities /
                        facilityComplianceDenominator) *
                      100
                    }%`,
                  }}
                />
              </div>

              <div className="compliance-row">
                <div>
                  <strong>Non-Compliant Facilities</strong>
                  <span>
                    Latest filtered submission is below the 40% requirement
                  </span>
                </div>
                <b>{filteredSummary.non_compliant_facilities}</b>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill red"
                  style={{
                    width: `${
                      (filteredSummary.non_compliant_facilities /
                        facilityComplianceDenominator) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="chart-card">
            <h3>Submission Compliance Status</h3>

            <div className="compliance-bars">
              <div className="compliance-row">
                <div>
                  <strong>Compliant Submissions</strong>
                  <span>
                    Filtered monthly submissions meeting the 40% requirement
                  </span>
                </div>
                <b>{filteredSummary.compliant_submissions}</b>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill green"
                  style={{
                    width: `${
                      (filteredSummary.compliant_submissions /
                        submissionComplianceDenominator) *
                      100
                    }%`,
                  }}
                />
              </div>

              <div className="compliance-row">
                <div>
                  <strong>Non-Compliant Submissions</strong>
                  <span>
                    Filtered monthly submissions below the 40% requirement
                  </span>
                </div>
                <b>{filteredSummary.non_compliant_submissions}</b>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill red"
                  style={{
                    width: `${
                      (filteredSummary.non_compliant_submissions /
                        submissionComplianceDenominator) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="trend-stack">
          <div className="chart-card wide">
            <h3>Funding Source Trend</h3>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={fundingSourceChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="reporting_period" />
                <YAxis
                  tickFormatter={(value) =>
                    `${(Number(value) / 1000000).toFixed(1)}M`
                  }
                />
                <Tooltip
                  formatter={(value) =>
                    `KES ${Number(value || 0).toLocaleString()}`
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="County Allocation"
                  stroke="#2563eb"
                />
                <Line type="monotone" dataKey="FIF" stroke="#16a34a" />
                <Line type="monotone" dataKey="SHIF" stroke="#f97316" />
                <Line type="monotone" dataKey="PHC" stroke="#7c3aed" />
                <Line
                  type="monotone"
                  dataKey="Partners"
                  stroke="#0f766e"
                />
                <Line
                  type="monotone"
                  dataKey="Donations"
                  stroke="#dc2626"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card wide">
            <h3>Total Allocation Trend</h3>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={hptAllocationChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="reporting_period" />
                <YAxis
                  tickFormatter={(value) =>
                    `${(Number(value) / 1000000).toFixed(1)}M`
                  }
                />
                <Tooltip
                  formatter={(value) =>
                    `KES ${Number(value || 0).toLocaleString()}`
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="amount_received"
                  name="Total Funds Received"
                  stroke="#2563eb"
                />
                <Line
                  type="monotone"
                  dataKey="hpt_spent"
                  name="HPT Expenditure"
                  stroke="#f97316"
                />
                <Line
                  type="monotone"
                  dataKey="chp_kits_used"
                  name="CHP Kits Support"
                  stroke="#7c3aed"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-card wide">
        <div className="table-title-row">
          <h3>Facility Compliance Table</h3>

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
                <th>HPT %</th>
                <th>HPT Status</th>
                <th>CHP Kits Amount</th>
              </tr>
            </thead>

            <tbody>
              {paginatedFacilities.map((facility, index) => (
                <tr
                  key={`${facility.mfl_code}-${facility.reporting_period}-${index}`}
                >
                  <td>{facility.facility_name}</td>
                  <td>{facility.subcounty_name || "—"}</td>
                  <td>{facility.ward_name || "—"}</td>
                  <td>{facility.reporting_period || "—"}</td>
                  <td>{facility.funding_source || "—"}</td>
                  <td>{facility.hpt_percent}%</td>
                  <td>
                    <span
                      className={
                        facility.compliance_status === "Compliant"
                          ? "status compliant"
                          : "status non-compliant"
                      }
                    >
                      {facility.compliance_status}
                    </span>
                  </td>
                  <td>{money(facility.amount_used_for_chp_kits)}</td>
                </tr>
              ))}

              {paginatedFacilities.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    No records found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((currentPage) => currentPage - 1)}
          >
            Previous
          </button>

          <span>
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => setPage((currentPage) => currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default CountyDashboard;