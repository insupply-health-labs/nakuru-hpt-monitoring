import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Wallet,
  Upload,
  FileText,
  ArrowRight,
  ArrowLeft,
  Send,
  Info,
} from "lucide-react";
import api from "../api/api";
import "./DataCollection.css";

function formatNumber(value: string) {
  const raw = value.replace(/,/g, "").replace(/[^\d]/g, "");
  if (!raw) return "";
  return Number(raw).toLocaleString();
}

function cleanNumber(value: string) {
  return value.replace(/,/g, "");
}

function toNumber(value: string) {
  return Number(cleanNumber(value) || 0);
}

function money(value: number) {
  return `KES ${value.toLocaleString()}`;
}

interface Facility {
  mfl_code: string;
  facility_name: string;
}

const fundingSources = [
  "County Allocation",
  "FIF",
  "SHIF",
  "PHC",
  "Partners",
  "Monetary Donations",
];

const procurementSources = ["KEMSA", "MEDS", "Prequalified Suppliers"];

const hptCategories = [
  "Medicines",
  "Medical Supplies",
  "Radiology",
  "Nutrition",
  "Diagnostics",
  "Immunization",
];

function DataCollection() {
  const user = JSON.parse(sessionStorage.getItem("hpt_user") || "{}");
  const isFacilityUser = user?.role === "facility";

  const [step, setStep] = useState(1);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [document, setDocument] = useState<File | null>(null);
 
  const [submitting, setSubmitting] = useState(false);
  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    mfl_code: "",
    reporting_year: String(currentYear),
    reporting_month: "",
    no_funds_received: false,
    date_received: "",
    amount_used_for_chp_kits: "",
    submitter_name: "",
    submitter_phone: "",
    submitter_designation: "",
    declaration: false,
  });
  
  const [funding, setFunding] = useState(
  fundingSources.map((source) => ({
    source,
    selected: false,
    amount: "",
    detail: "",
  }))
);

  const [procurement, setProcurement] = useState<string[]>([]);

  const [categories, setCategories] = useState(
    hptCategories.map((category) => ({
      category,
      allocated: "",
      spent: "",
    }))
  );

  useEffect(() => {
    api
      .get("/facilities")
      .then((res) => setFacilities(res.data))
      .catch((err) => console.error(err));
  }, []);

  function updateField(field: string, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  const selectedFacility = facilities.find(
    (facility) => facility.mfl_code === form.mfl_code
  );

  const facilityName = isFacilityUser
    ? user.facility_name || ""
    : selectedFacility?.facility_name || "";

  const facilityMfl = isFacilityUser
    ? user.facility_mfl_code || ""
    : form.mfl_code;

  const totalFunding = useMemo(() => {
    if (form.no_funds_received) return 0;
    return funding.reduce(
      (sum, item) => sum + (item.selected ? toNumber(item.amount) : 0),
      0
    );
  }, [funding, form.no_funds_received]);

  const totalAllocatedToHpt = useMemo(() => {
    if (form.no_funds_received) return 0;
    return categories.reduce((sum, item) => sum + toNumber(item.allocated), 0);
  }, [categories, form.no_funds_received]);

  const totalSpentOnHpt = useMemo(() => {
    if (form.no_funds_received) return 0;
    return categories.reduce((sum, item) => sum + toNumber(item.spent), 0);
  }, [categories, form.no_funds_received]);

  const requiredHptAllocation = totalFunding * 0.4;
 
  const hptPercent =
    totalFunding > 0 ? (totalAllocatedToHpt / totalFunding) * 100 : 0;

  const complianceStatus =
    totalFunding === 0
      ? "No Funds Received"
      : hptPercent >= 40
      ? `Compliant (${hptPercent.toFixed(2)}%)`
      : `Non-compliant (${hptPercent.toFixed(2)}%)`;

  function toggleFunding(index: number) {
    setFunding((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              selected: !item.selected,
              amount: !item.selected ? item.amount : "",
            }
          : item
      )
    );
  }

  function updateFundingAmount(index: number, value: string) {
    setFunding((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              selected: true,
              amount: formatNumber(value),
            }
          : item
      )
    );
  }

  function toggleProcurement(source: string) {
    setProcurement((prev) =>
      prev.includes(source)
        ? prev.filter((item) => item !== source)
        : [...prev, source]
    );
  }

  function updateCategory(
    index: number,
    field: "allocated" | "spent",
    value: string
  ) {
    setCategories((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: formatNumber(value) } : item
      )
    );
  }

  function handleNoFundsChange(checked: boolean) {
    updateField("no_funds_received", checked);

    if (checked) {
      setFunding((prev) =>
        prev.map((item) => ({
          ...item,
          selected: false,
          amount: "",
          detail: "",
        }))
      );

      setCategories((prev) =>
        prev.map((item) => ({
          ...item,
          allocated: "",
          spent: "",
        }))
      );

      setProcurement([]);
      setDocument(null);

      updateField("amount_used_for_chp_kits", "");
      updateField("date_received", "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const isNoFunds = form.no_funds_received;

    const amountReceived = funding.reduce(
      (total, item) =>
        total +
        (item.selected
          ? Number(cleanNumber(item.amount))
          : 0),
      0
    );

    if (!facilityMfl) {
      alert("Please select a facility.");
      return;
    }

    if (!form.reporting_month) {
      alert("Please select the reporting month.");
      return;
    }

    if (
      !form.submitter_name.trim() ||
      !form.submitter_phone.trim() ||
      !form.submitter_designation.trim()
    ) {
      alert("Please complete all submitter details.");
      return;
    }

    if (!form.declaration) {
      alert("Please confirm the declaration before submitting.");
      return;
    }

    // Normal funded submission validation
    if (!isNoFunds) {
      if (amountReceived <= 0) {
        alert(
          "Please enter the funding received, or select No funds received this month."
        );
        return;
      }

      if (!form.date_received) {
        alert("Please select the date received.");
        return;
      }

      if (!document) {
        alert(
          "A supporting document is required when funds were received."
        );
        return;
      }

    }

    try {
      setSubmitting(true);

      const data = new FormData();

      data.append("mfl_code", facilityMfl);

      data.append(
        "amount_received",
        isNoFunds ? "0" : String(totalFunding)
      );

      data.append(
        "funding_source",
        isNoFunds
          ? "No Funds Received"
          : funding
              .filter((item) => item.selected)
              .map((item) => {
                if (item.source === "Partners") {
                  return item.detail.trim()
                    ? `Partner Funding (${item.detail.trim()})`
                    : "Partner Funding";
                }

                if (item.source === "Monetary Donations") {
                  return item.detail.trim()
                    ? `Donor Funding (${item.detail.trim()})`
                    : "Donor Funding";
                }

                return item.source;
              })
              .join("; ")
      );

      const monthMap: Record<string, string> = {
        January: "Jan",
        February: "Feb",
        March: "Mar",
        April: "Apr",
        May: "May",
        June: "Jun",
        July: "Jul",
        August: "Aug",
        September: "Sep",
        October: "Oct",
        November: "Nov",
        December: "Dec",
      };

      const shortMonth =
        monthMap[form.reporting_month] ||
        form.reporting_month;

      data.append(
        "reporting_period",
        `${shortMonth}-${form.reporting_year}`
      );

      data.append(
        "procurement_source",
        isNoFunds
          ? ""
          : procurement.join(", ")
      );

      if (!isNoFunds) {
        data.append(
          "date_received",
          form.date_received
        );
      }

      data.append(
        "amount_allocated_to_hpt",
        isNoFunds
          ? "0"
          : String(totalAllocatedToHpt)
      );

      data.append(
        "amount_spent_on_hpt",
        isNoFunds
          ? "0"
          : String(totalSpentOnHpt)
      );

      data.append(
        "amount_used_for_chp_kits",
        isNoFunds
          ? "0"
          : String(
              toNumber(
                form.amount_used_for_chp_kits
              )
            )
      );

      const submittedBy = [
        form.submitter_name,
        form.submitter_phone,
        form.submitter_designation,
      ].join(" | ");

      data.append(
        "submitted_by",
        submittedBy
      );

      data.append(
        "submitter_phone",
        form.submitter_phone
      );

      if (!isNoFunds && document) {
        data.append(
          "supporting_document",
          document
        );
      }

      await api.post(
        "/submit-record",
        data
      );

      alert(
        isNoFunds
          ? "No Funds Received report submitted successfully."
          : "Record submitted successfully."
      );
    } catch (error: any) {
      console.error(error);

      const detail =
        error?.response?.data?.detail;

      alert(
        typeof detail === "string"
          ? detail
          : "Failed to submit record"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="collection-page">
      <div className="page-header">
        <h2>HPT Data Collection</h2>
        <p>Submit facility HPT funding records and supporting documents.</p>
      </div>

      <form className="collection-card" onSubmit={handleSubmit}>
        <div className="step-header">
          <h3>
            {step === 1
              ? "Step 1: Funding & HPT Information"
              : form.no_funds_received
              ? "Step 2: Submitter Details"
              : "Step 2: Supporting Documents & Submitter Details"}
          </h3>
          <span>Step {step} of 2</span>
        </div>

        {step === 1 && (
          <>
            <div className="info-box">
              <Info size={22} />
              <div>
                <strong>HPT Funding Requirements</strong>
                <p>
                  At least <b>40%</b> of the Approved/Allocated Amount should be
                  allocated to HPT. 
                </p>
              </div>
            </div>

            <div className="section-title">
              <Building2 size={18} />
              <span>Facility Information</span>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Facility Name</label>
                {isFacilityUser ? (
                  <input type="text" value={facilityName} disabled />
                ) : (
                  <select
                    value={form.mfl_code}
                    onChange={(e) => updateField("mfl_code", e.target.value)}
                    required
                  >
                    <option value="">Select facility</option>
                    {facilities.map((facility) => (
                      <option
                        key={facility.mfl_code}
                        value={facility.mfl_code}
                      >
                        {facility.facility_name} - {facility.mfl_code}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label>MFL Code</label>
                <input type="text" value={facilityMfl} disabled />
              </div>

              <div className="form-group">
                <label>Reporting Year</label>
                <select
                  value={form.reporting_year}
                  onChange={(e) =>
                    updateField("reporting_year", e.target.value)
                  }
                  required
                >
                  {[currentYear - 1, currentYear, currentYear + 1].map(
                    (year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Reporting Month</label>
                <select
                  value={form.reporting_month}
                  onChange={(e) =>
                    updateField("reporting_month", e.target.value)
                  }
                  required
                >
                  <option value="">Select month</option>
                  {[
                    "January",
                    "February",
                    "March",
                    "April",
                    "May",
                    "June",
                    "July",
                    "August",
                    "September",
                    "October",
                    "November",
                    "December",
                  ].map((month) => (
                    <option key={month}>{month}</option>
                  ))}
                </select>
              </div>

              <div className="form-group checkbox-line">
                <label>
                  <input
                    type="checkbox"
                    checked={form.no_funds_received}
                    onChange={(e) => handleNoFundsChange(e.target.checked)}
                  />
                  No funds received this month
                </label>
              </div>

              <div className="form-group">
                <label>Date Received</label>
                <input
                  type="date"
                  value={form.date_received}
                  disabled={form.no_funds_received}
                  onChange={(e) => updateField("date_received", e.target.value)}
                  required={!form.no_funds_received}
                />
              </div>
            </div>

            <div className="section-title">
              <Wallet size={18} />
              <span>Funding Sources</span>
            </div>

            <p className="helper-text">
              For County Allocation, enter the Allocated Amount. For SHIF, PHC,
              FIF, Partners and Donations, enter the Approved Amount (AIE).
            </p>

            <div className="funding-layout">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Funding Source</th>
                    <th>Approved AIE / Allocated Amount (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {funding.map((item, index) => (
                    <tr key={item.source}>
                      <td>
                        <label className="table-check">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            disabled={form.no_funds_received}
                            onChange={() => toggleFunding(index)}
                          />
                          {item.source}
                        </label>
                          {item.selected &&
                          (item.source === "Monetary Donations" ||
                            item.source === "Partners") && (
                            <input
                            type="text"
                            className="funding-detail-input"
                            placeholder={item.source === "Monetary Donations"
                              ? "Enter donor name"
                              : "Enter partner name"
                            }
                            value={item.detail}
                            disabled={form.no_funds_received}
                            onChange={(e) => {
                              const updatedFunding = [...funding];
                              updatedFunding[index].detail = e.target.value;
                              setFunding(updatedFunding);
                            }}
                            required
                          /> 
                        )}
            
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.amount}
                          disabled={form.no_funds_received || !item.selected}
                          onChange={(e) =>
                            updateFundingAmount(index, e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  
                  <tr className="total-row">
                    <td>Total Funding</td>
                    <td>{money(totalFunding)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="summary-panel">
                <div>
                  <span>Total Funding</span>
                  <strong>{money(totalFunding)}</strong>
                </div>
                <div>
                  <span>Required HPT Allocation (40%)</span>
                  <strong>{money(requiredHptAllocation)}</strong>
                </div>

              </div>
            </div>

            <div className="two-column-section">
              <div>
                <div className="section-title">
                  <span>Procurement Sources</span>
                </div>

                <div className="checkbox-list">
                  {procurementSources.map((source) => (
                    <label key={source}>
                      <input
                        type="checkbox"
                        checked={procurement.includes(source)}
                        disabled={form.no_funds_received}
                        onChange={() => toggleProcurement(source)}
                      />
                      {source}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-title">
                  <span>HPT Category Breakdown</span>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>HPT Category</th>
                      <th>Amount Allocated (KES)</th>
                      <th>Amount Spent (KES)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((item, index) => (
                      <tr key={item.category}>
                        <td>{item.category}</td>
                        <td>
                          <input
                            type="text"
                            value={item.allocated}
                            disabled={form.no_funds_received}
                            onChange={(e) =>
                              updateCategory(index, "allocated", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.spent}
                            disabled={form.no_funds_received}
                            onChange={(e) =>
                              updateCategory(index, "spent", e.target.value)
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td>Total</td>
                      <td>{money(totalAllocatedToHpt)}</td>
                      <td>{money(totalSpentOnHpt)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="hpt-summary">
              <div>
                <span>Amount Allocated to HPT</span>
                <strong>{money(totalAllocatedToHpt)}</strong>
              </div>

              <div>
                <span>Amount Spent on HPT</span>
                <strong>{money(totalSpentOnHpt)}</strong>
              </div>

              <div>
                <span>Amount Used for CHP Kits</span>
                <input
                  type="text"
                  value={form.amount_used_for_chp_kits}
                  disabled={form.no_funds_received}
                  onChange={(e) =>
                    updateField(
                      "amount_used_for_chp_kits",
                      formatNumber(e.target.value)
                    )
                  }
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <span>HPT Compliance Status</span>
                <strong>{complianceStatus}</strong>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="submit-btn"
                onClick={() => setStep(2)}
              >
                Next <ArrowRight size={18} />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div
              className="two-column-section"
              style={
                form.no_funds_received
                  ? { gridTemplateColumns: "1fr" }
                  : undefined
              }
            >
              {!form.no_funds_received && (
                <div>
                  <div className="section-title">
                    <FileText size={18} />
                    <span>Supporting Documents</span>
                </div>

                <div className="info-box warning">
                  <div>
                    <strong>PDF files only</strong>
                    <p>Examples of required supporting documents:</p>
                    <ul>
                      <li>Allocation Drawing Rights (ADR)</li>
                      <li>Invoice</li>
                      <li>Requisition</li>
                      <li>Distribution List</li>
                    </ul>
                  </div>
                </div>

                <label className="upload-box">
                  <Upload size={28} />
                  <span>
                    {document ? document.name : "Choose PDF supporting document"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) =>
                      setDocument(e.target.files?.[0] || null)
                    }
                  />
                </label>
                </div>
              )}

              <div>
                <div className="section-title">
                  <span>Submitter Details</span>
                </div>

                <div className="form-group">
                  <label>Submitter Name</label>
                  <input
                    type="text"
                    value={form.submitter_name}
                    onChange={(e) =>
                      updateField("submitter_name", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={form.submitter_phone}
                    onChange={(e) =>
                      updateField("submitter_phone", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Designation</label>
                  <input
                    type="text"
                    value={form.submitter_designation}
                    onChange={(e) =>
                      updateField("submitter_designation", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="declaration-box">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.declaration}
                      onChange={(e) =>
                        updateField("declaration", e.target.checked)
                      }
                    />
                    I confirm that the information provided is accurate and
                    complete.
                  </label>
                </div>
              </div>
            </div>

            <div className="info-box">
              <Info size={22} />
              <p>
                If no funds were received this month, submit the report with zero
                amounts. It will be recorded as <b>No Funds Received</b>, not
                non-compliant.
              </p>
            </div>

            <div className="form-actions split">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={18} /> Back
              </button>

              <button
                type="submit"
                className="submit-btn"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit"}
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default DataCollection;
