import FacilitySHASection from "../components/FacilitySHASection";
import "./FacilitySHAReporting.css";

function FacilitySHAReporting() {
  return (
    <div className="facility-sha-page">
      <div className="facility-sha-page-header">
        <div>
          <span className="facility-sha-eyebrow">
            Facility Reporting
          </span>

          <h2>SHA Reporting</h2>

          <p>
            Submit quarterly SHA claims,
            reimbursements, rejections and
            supporting evidence for your facility.
          </p>
        </div>
      </div>

      <FacilitySHASection />
    </div>
  );
}

export default FacilitySHAReporting;
