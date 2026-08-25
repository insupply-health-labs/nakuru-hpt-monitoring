from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Literal
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime
import pandas as pd
import shutil
from sqlalchemy.orm import Session
from fastapi import Depends
from database import Base, engine, get_db
from models import (
    HPTRecord,
    SHAReport,
    SupportingDocument,
    User,
)
from auth import router as auth_router
from security import get_current_user, require_roles
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
# Create any database tables that do not already exist.
Base.metadata.create_all(bind=engine)

class ReviewRecordRequest(BaseModel):
    record_id: int | str | None = None
    mfl_code: str
    reporting_period: str
    review_status: Literal["Accepted", "Rejected"]
    review_reason: str = ""
    reviewed_by: str = "county_reviewer"
    
app = FastAPI(title="Nakuru HPT - Financial Monitoring System API")

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"

FACILITY_FILE = DATA_DIR / "facility_master.xlsx"
HPT_FILE = DATA_DIR / "hpt_records.xlsx"
SHA_FILE = DATA_DIR / "county_sha_reports.xlsx"
SHA_UPLOAD_DIR = UPLOAD_DIR / "sha_reports"
SHA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

UPLOAD_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://nakuru-hpt-dashboard-cdu36.ondigitalocean.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

REQUIRED_HPT_PERCENT = 40
REQUIRED_CHP_KIT_PERCENT_OF_HPT = 5

MAX_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_SHA_DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".xls",
    ".xlsx",
}

SHA_DOCUMENT_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet"
    ),
}


def clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "_")
        .str.replace("-", "_")
    )
    return df


def load_facilities() -> pd.DataFrame:
    df = pd.read_excel(FACILITY_FILE)
    df = clean_columns(df)

    rename_map = {
        "facility_na": "facility_name",
        "facility_name": "facility_name",
        "ward_nam": "ward_name",
        "ward_name": "ward_name",
        "county_na": "county_name",
        "county_name": "county_name",
        "sub_count": "subcounty_name",
        "sub_county": "subcounty_name",
        "sub_county_name": "subcounty_name",
        "subcounty": "subcounty_name",
        "subcounty_name": "subcounty_name",
    }

    df = df.rename(columns=rename_map)

    if "facility_ownership_name" in df.columns:
        df = df[
            df["facility_ownership_name"]
            .astype(str)
            .str.upper()
            .isin(["PUBLIC", "FBO"])
        ]

    needed = [
        "mfl_code",
        "facility_id",
        "facility_name",
        "ward_name",
        "subcounty_name",
        "county_name",
        "keph_level",
        "facility_ownership_name",
    ]

    for col in needed:
        if col not in df.columns:
            df[col] = ""

    df["mfl_code"] = df["mfl_code"].astype(str).str.strip()

    return df[needed]


def format_database_datetime(value) -> str:
    if not value:
        return ""

    return value.strftime("%Y-%m-%d %H:%M:%S")


def parse_reporting_period_sort(value):
    text = str(value or "").strip()

    if not text:
        return pd.NaT

    accepted_formats = [
        "%Y-%m",
        "%Y-%m-%d",
        "%B %Y",
        "%b %Y",
    ]

    for date_format in accepted_formats:
        parsed = pd.to_datetime(
            text,
            format=date_format,
            errors="coerce",
        )

        if not pd.isna(parsed):
            return parsed

    return pd.NaT


def load_hpt_records(db: Session) -> pd.DataFrame:
    records = (
        db.query(HPTRecord)
        .order_by(
            HPTRecord.submission_date.asc(),
            HPTRecord.record_id.asc(),
        )
        .all()
    )

    columns = [
        "record_id",
        "mfl_code",
        "amount_received",
        "funding_source",
        "procurement_source",
        "date_received",
        "amount_allocated_to_hpt",
        "amount_spent_on_hpt",
        "amount_used_for_chp_kits",
        "supporting_document_id",
        "supporting_document",
        "submitted_by",
        "submitter_phone",
        "submission_date",
        "reporting_period",
        "review_status",
        "review_reason",
        "reviewed_by",
        "reviewed_at",
    ]

    data = []

    for record in records:
        document_url = (
            f"/documents/{record.supporting_document_id}"
            if record.supporting_document_id
            else ""
        )

        data.append(
            {
                "record_id": record.record_id,
                "mfl_code": record.mfl_code,
                "amount_received": record.amount_received or 0,
                "funding_source": record.funding_source or "",
                "procurement_source": (
                    record.procurement_source or ""
                ),
                "date_received": record.date_received or "",
                "amount_allocated_to_hpt": (
                    record.amount_allocated_to_hpt or 0
                ),
                "amount_spent_on_hpt": (
                    record.amount_spent_on_hpt or 0
                ),
                "amount_used_for_chp_kits": (
                    record.amount_used_for_chp_kits or 0
                ),
                "supporting_document_id": (
                    record.supporting_document_id or ""
                ),
                "supporting_document": document_url,
                "submitted_by": record.submitted_by or "",
                "submitter_phone": record.submitter_phone or "",
                "submission_date": format_database_datetime(
                    record.submission_date
                ),
                "reporting_period": (
                    record.reporting_period or ""
                ),
                "review_status": (
                    record.review_status or "Pending"
                ),
                "review_reason": record.review_reason or "",
                "reviewed_by": record.reviewed_by or "",
                "reviewed_at": format_database_datetime(
                    record.reviewed_at
                ),
            }
        )

    df = pd.DataFrame(data, columns=columns)

    df["mfl_code"] = (
        df["mfl_code"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    money_columns = [
        "amount_received",
        "amount_allocated_to_hpt",
        "amount_spent_on_hpt",
        "amount_used_for_chp_kits",
    ]

    for column in money_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        ).fillna(0)

    review_columns = [
        "review_status",
        "review_reason",
        "reviewed_by",
        "reviewed_at",
    ]

    for column in review_columns:
        df[column] = (
            df[column]
            .fillna("")
            .astype(str)
            .str.strip()
        )

    df.loc[
        df["review_status"] == "",
        "review_status",
    ] = "Pending"

    df["balance"] = (
        df["amount_allocated_to_hpt"]
        - df["amount_spent_on_hpt"]
    )

    df["hpt_percent"] = df.apply(
        lambda row: round(
            (
                row["amount_allocated_to_hpt"]
                / row["amount_received"]
            )
            * 100,
            2,
        )
        if row["amount_received"] > 0
        else 0,
        axis=1,
    )

    df["required_hpt_percent"] = REQUIRED_HPT_PERCENT

    df["compliance_status"] = df["hpt_percent"].apply(
        lambda value: (
            "Compliant"
            if value >= REQUIRED_HPT_PERCENT
            else "Non-Compliant"
        )
    )

    df["required_chp_kits_amount"] = (
        df["amount_allocated_to_hpt"]
        * (
            REQUIRED_CHP_KIT_PERCENT_OF_HPT
            / 100
        )
    )

    df["chp_kits_percent_of_hpt"] = df.apply(
        lambda row: round(
            (
                row["amount_used_for_chp_kits"]
                / row["amount_allocated_to_hpt"]
            )
            * 100,
            2,
        )
        if row["amount_allocated_to_hpt"] > 0
        else 0,
        axis=1,
    )

    df["required_chp_kits_percent_of_hpt"] = (
        REQUIRED_CHP_KIT_PERCENT_OF_HPT
    )

    df["chp_kits_status"] = df.apply(
        lambda row: (
            "Compliant"
            if row["amount_used_for_chp_kits"]
            >= row["required_chp_kits_amount"]
            else "Below Target"
        ),
        axis=1,
    )

    df["reporting_period_sort"] = df[
        "reporting_period"
    ].apply(parse_reporting_period_sort)

    return df


def normalize_mfl_code(value) -> str:
    if pd.isna(value):
        return ""

    text = str(value).strip()

    if text.lower() in {"", "nan", "none"}:
        return ""

    if text.endswith(".0"):
        text = text[:-2]

    return text



def enforce_facility_scope(
    current_user: User,
    requested_mfl_code: str,
) -> None:
    """
    Facility users may only act on their own linked MFL code.
    County/admin access is controlled separately by route roles.
    """
    if current_user.role != "facility":
        return

    user_mfl = normalize_mfl_code(
        current_user.facility_mfl_code
    )

    requested_mfl = normalize_mfl_code(
        requested_mfl_code
    )

    if not user_mfl:
        raise HTTPException(
            status_code=403,
            detail=(
                "No facility is linked to this account."
            ),
        )

    if user_mfl != requested_mfl:
        raise HTTPException(
            status_code=403,
            detail=(
                "You may only access data for your "
                "registered facility."
            ),
        )


def get_joined_data(
    db: Session,
) -> pd.DataFrame:
    facilities = load_facilities().copy()
    records = load_hpt_records(db).copy()

    facilities["mfl_code"] = facilities[
        "mfl_code"
    ].apply(normalize_mfl_code)

    records["mfl_code"] = records[
        "mfl_code"
    ].apply(normalize_mfl_code)

    facilities = facilities[
        facilities["mfl_code"] != ""
    ].copy()

    records = records[
        records["mfl_code"] != ""
    ].copy()

    duplicate_facilities = facilities[
        facilities.duplicated(
            subset=["mfl_code"],
            keep=False,
        )
    ]

    if not duplicate_facilities.empty:
        duplicate_codes = sorted(
            duplicate_facilities["mfl_code"]
            .astype(str)
            .unique()
            .tolist()
        )

        raise ValueError(
            "Duplicate valid MFL codes found in "
            "facility master: "
            + ", ".join(duplicate_codes)
        )

    return records.merge(
        facilities,
        on="mfl_code",
        how="inner",
        validate="many_to_one",
    )
@app.get("/")
def home():
    return {"message": "Nakuru HPT Monitoring API is running"}


@app.get("/county-sha-reports")
def get_county_sha_reports(
    current_user: User = Depends(
        require_roles("county", "admin")
    ),
    db: Session = Depends(get_db),
):
    reports = (
        db.query(SHAReport)
        .order_by(
            SHAReport.submitted_at.desc(),
            SHAReport.report_id.desc(),
        )
        .all()
    )

    results = []

    for report in reports:
        document_url = (
            f"/documents/{report.supporting_document_id}"
            if report.supporting_document_id
            else ""
        )

        results.append(
            {
                "report_id": str(report.report_id),
                "report_type": report.report_type or "",
                "frequency": report.frequency or "",
                "reporting_year": (
                    report.reporting_year or ""
                ),
                "reporting_month": (
                    report.reporting_month or ""
                ),
                "reporting_quarter": (
                    report.reporting_quarter or ""
                ),
                "reporting_period": (
                    report.reporting_period or ""
                ),
                "value": float(report.value or 0),
                "submitted_by": (
                    report.submitted_by or ""
                ),
                "notes": report.notes or "",
                "supporting_document": document_url,
                "submitted_at": (
                    format_database_datetime(
                        report.submitted_at
                    )
                ),
            }
        )

    return results



@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/facilities")
def facilities():
    df = load_facilities()
    df = df.astype(object)
    return df.fillna("").to_dict(orient="records")


@app.get("/records")
def records(
    current_user: User = Depends(
        require_roles("facility", "county", "admin")
    ),
    db: Session = Depends(get_db),
):
    df = get_joined_data(db)
    df = df.astype(object)

    return df.fillna("").to_dict(
        orient="records"
    )


@app.get("/dashboard/county")
def county_dashboard(
    reporting_periods: str = "All",
    subcounties: str = "All",
    funding_sources: str = "All",
    current_user: User = Depends(
        require_roles("county", "admin")
    ),
    db: Session = Depends(get_db),
):
    df = get_joined_data(db)

    if reporting_periods != "All":
        selected_periods = reporting_periods.split(",")
        df = df[df["reporting_period"].isin(selected_periods)]

    if subcounties != "All":
        selected_subcounties = subcounties.split(",")
        df = df[df["subcounty_name"].isin(selected_subcounties)]
    if funding_sources != "All":
        selected_funding_sources = funding_sources.split(",")
        df = df[df["funding_source"].isin(selected_funding_sources)]
    df["reporting_month"] = df["reporting_period"]
    total_received = df["amount_received"].sum()
    total_hpt_allocated = df["amount_allocated_to_hpt"].sum()
    total_hpt_spent = df["amount_spent_on_hpt"].sum()
    total_balance = total_hpt_allocated - total_hpt_spent

    total_chp_kits_used = df["amount_used_for_chp_kits"].sum()
    required_chp_kits_amount = df["required_chp_kits_amount"].sum()

    hpt_percent = (
        round((total_hpt_allocated / total_received) * 100, 2)
        if total_received > 0
        else 0
    )

    chp_kits_percent_of_hpt = (
        round((total_chp_kits_used / total_hpt_allocated) * 100, 2)
        if total_hpt_allocated > 0
        else 0
    )

    total_facilities = df["mfl_code"].nunique()
    compliant = df[df["compliance_status"] == "Compliant"]["mfl_code"].nunique()
    non_compliant = df[df["compliance_status"] == "Non-Compliant"][
        "mfl_code"
    ].nunique()

    chp_compliant = df[df["chp_kits_status"] == "Compliant"]["mfl_code"].nunique()
    chp_below_target = df[df["chp_kits_status"] == "Below Target"][
        "mfl_code"
    ].nunique()

    summary = {
        "total_amount_received": float(total_received),
        "total_hpt_allocated": float(total_hpt_allocated),
        "total_hpt_spent": float(total_hpt_spent),
        "total_balance": float(total_balance),
        "average_hpt_percent": float(hpt_percent),
        "required_hpt_percent": int(REQUIRED_HPT_PERCENT),
        "total_facilities_submitted": int(total_facilities),
        "compliant_facilities": int(compliant),
        "non_compliant_facilities": int(non_compliant),
        "total_chp_kits_used": float(total_chp_kits_used),
        "required_chp_kits_amount": float(required_chp_kits_amount),
        "chp_kits_percent_of_hpt": float(chp_kits_percent_of_hpt),
        "required_chp_kits_percent_of_hpt": int(REQUIRED_CHP_KIT_PERCENT_OF_HPT),
        "chp_kits_compliant_facilities": int(chp_compliant),
        "chp_kits_below_target_facilities": int(chp_below_target),
    }
    facility_compliance = (
    df.groupby(
        [
            "mfl_code",
            "facility_name",
            "subcounty_name",
            "ward_name",
            "reporting_period",
            "funding_source",
        ],
        dropna=False,
    )
    .agg(
        amount_received=("amount_received", "sum"),
        hpt_allocated=("amount_allocated_to_hpt", "sum"),
        hpt_spent=("amount_spent_on_hpt", "sum"),
        amount_used_for_chp_kits=("amount_used_for_chp_kits", "sum"),
    )
    .reset_index()
)

    facility_compliance["balance"] = (
        facility_compliance["hpt_allocated"] - facility_compliance["hpt_spent"]
    )

    facility_compliance["hpt_percent"] = facility_compliance.apply(
        lambda row: round((row["hpt_allocated"] / row["amount_received"]) * 100, 2)
        if row["amount_received"] > 0
        else 0,
        axis=1,
    )

    facility_compliance["required_hpt_percent"] = REQUIRED_HPT_PERCENT

    facility_compliance["compliance_status"] = facility_compliance["hpt_percent"].apply(
        lambda x: "Compliant" if x >= REQUIRED_HPT_PERCENT else "Non-Compliant"
    )

    facility_compliance["required_chp_kits_amount"] = (
        facility_compliance["hpt_allocated"] * 0.05
    )

    facility_compliance["chp_kits_percent_of_hpt"] = facility_compliance.apply(
        lambda row: round(
            (row["amount_used_for_chp_kits"] / row["hpt_allocated"]) * 100,
            2,
        )
        if row["hpt_allocated"] > 0
        else 0,
        axis=1,
    )

    facility_compliance["required_chp_kits_percent_of_hpt"] = (
        REQUIRED_CHP_KIT_PERCENT_OF_HPT
    )

    facility_compliance["chp_kits_status"] = facility_compliance.apply(
        lambda row: (
            "Compliant"
            if row["amount_used_for_chp_kits"] >= row["required_chp_kits_amount"]
            else "Below Target"
        ),
        axis=1,
    )
    


    
    facility_compliance = facility_compliance.astype(object)
    funding_source_trend = (
    df.groupby(
        ["reporting_period_sort", "reporting_period", "funding_source"],
        dropna=False,
    )
    .agg(amount_received=("amount_received", "sum"))
    .reset_index()
    .sort_values("reporting_period_sort")
)

    hpt_allocation_trend = (
    df.groupby(
        ["reporting_period_sort", "reporting_period"],
        dropna=False,
    )
    .agg(
        amount_received=("amount_received", "sum"),
        hpt_allocated=("amount_allocated_to_hpt", "sum"),
        hpt_spent=("amount_spent_on_hpt", "sum"),
        chp_kits_used=("amount_used_for_chp_kits", "sum"),
    )
    .reset_index()
    .sort_values("reporting_period_sort")
)
    return {
        "summary": summary,
        "facility_compliance": facility_compliance.fillna("").to_dict(
            orient="records"
        ),
        "funding_source_trend": funding_source_trend.fillna("").to_dict(orient="records"),
        "hpt_allocation_trend": hpt_allocation_trend.fillna("").to_dict(orient="records"),
    }



@app.get("/dashboard/facility/{mfl_code}")
def facility_dashboard(
    mfl_code: str,
    current_user: User = Depends(
        require_roles("facility", "county", "admin")
    ),
    db: Session = Depends(get_db),
):
    enforce_facility_scope(
        current_user,
        mfl_code,
    )

    df = get_joined_data(db)
    df = df[df["mfl_code"].astype(str) == str(mfl_code)]

    if df.empty:
        return {"message": "No records found for this facility", "records": []}

    total_received = df["amount_received"].sum()
    total_hpt_allocated = df["amount_allocated_to_hpt"].sum()
    total_hpt_spent = df["amount_spent_on_hpt"].sum()
    total_chp_kits_used = df["amount_used_for_chp_kits"].sum()

    balance = total_hpt_allocated - total_hpt_spent

    hpt_percent = (
        round((total_hpt_allocated / total_received) * 100, 2)
        if total_received > 0
        else 0
    )

    chp_kits_percent_of_hpt = (
        round((total_chp_kits_used / total_hpt_allocated) * 100, 2)
        if total_hpt_allocated > 0
        else 0
    )

    return {
        "summary": {
            "facility_name": df["facility_name"].iloc[0],
            "subcounty_name": df["subcounty_name"].iloc[0],
            "ward_name": df["ward_name"].iloc[0],
            "amount_received": float(total_received),
            "hpt_allocated": float(total_hpt_allocated),
            "hpt_spent": float(total_hpt_spent),
            "balance": float(balance),
            "hpt_percent": float(hpt_percent),
            "required_hpt_percent": int(REQUIRED_HPT_PERCENT),
            "compliance_status": "Compliant"
            if hpt_percent >= REQUIRED_HPT_PERCENT
            else "Non-Compliant",
            "amount_used_for_chp_kits": float(total_chp_kits_used),
            "chp_kits_percent_of_hpt": float(chp_kits_percent_of_hpt),
            "required_chp_kits_percent_of_hpt": int(
                REQUIRED_CHP_KIT_PERCENT_OF_HPT
            ),
        },
        "records": df.astype(object).fillna("").to_dict(orient="records"),
    }
def ensure_sha_file():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not SHA_FILE.exists():
        columns = [
            "report_id",
            "report_type",
            "frequency",
            "reporting_year",
            "reporting_month",
            "reporting_quarter",
            "reporting_period",
            "value",
            "submitted_by",
            "notes",
            "supporting_document",
            "submitted_at",
        ]

        pd.DataFrame(
            columns=columns
        ).to_excel(
            SHA_FILE,
            index=False,
        )

@app.post("/county-sha-reports")
async def submit_county_sha_report(
    report_type: str = Form(...),
    reporting_year: str = Form(...),
    reporting_month: str = Form(""),
    reporting_quarter: str = Form(""),
    value: float = Form(0),
    submitted_by: str = Form("SHA Coordinator"),
    notes: str = Form(""),
    supporting_document: UploadFile | None = File(None),
    current_user: User = Depends(
        require_roles("county", "admin")
    ),
    db: Session = Depends(get_db),
):
    valid_report_types = {
        "SHA Contracted Facilities",
        "SHA Claims",
        "SHA Reimbursements",
        "SHA Rejections",
    }

    cleaned_report_type = report_type.strip()
    cleaned_year = reporting_year.strip()
    cleaned_month = reporting_month.strip()
    cleaned_quarter = reporting_quarter.strip()
    cleaned_submitted_by = submitted_by.strip()
    cleaned_notes = notes.strip()

    if cleaned_report_type not in valid_report_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid SHA report type.",
        )

    if not cleaned_year:
        raise HTTPException(
            status_code=400,
            detail="Reporting year is required.",
        )

    if cleaned_report_type == "SHA Contracted Facilities":
        frequency = "Quarterly"

        if not cleaned_quarter:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Reporting quarter is required for "
                    "contracted facilities."
                ),
            )

        reporting_period = (
            f"{cleaned_quarter}-{cleaned_year}"
        )

        # Quarterly reports do not use a month.
        cleaned_month = ""

    else:
        frequency = "Monthly"

        if not cleaned_month:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Reporting month is required for "
                    "this report type."
                ),
            )

        reporting_period = (
            f"{cleaned_month}-{cleaned_year}"
        )

        # Monthly reports do not use a quarter.
        cleaned_quarter = ""

    if value < 0:
        raise HTTPException(
            status_code=400,
            detail="Report value cannot be negative.",
        )

    try:
        supporting_document_id = None

        if (
            supporting_document
            and supporting_document.filename
        ):
            original_filename = (
                supporting_document.filename.strip()
            )

            file_extension = Path(
                original_filename
            ).suffix.lower()

            if (
                file_extension
                not in ALLOWED_SHA_DOCUMENT_EXTENSIONS
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Only PDF, XLS and XLSX documents "
                        "are allowed."
                    ),
                )

            file_bytes = await supporting_document.read()

            if not file_bytes:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "The uploaded supporting "
                        "document is empty."
                    ),
                )

            if len(file_bytes) > MAX_DOCUMENT_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "The supporting document must "
                        "not exceed 10 MB."
                    ),
                )

            stored_content_type = (
                supporting_document.content_type
                or SHA_DOCUMENT_CONTENT_TYPES[
                    file_extension
                ]
            )

            document = SupportingDocument(
                original_filename=original_filename,
                content_type=stored_content_type,
                file_size=len(file_bytes),
                file_data=file_bytes,
                uploaded_by=(
                    cleaned_submitted_by
                    or "SHA Coordinator"
                ),
            )

            db.add(document)
            db.flush()

            supporting_document_id = document.id

        sha_report = SHAReport(
            report_type=cleaned_report_type,
            frequency=frequency,
            reporting_year=cleaned_year,
            reporting_month=cleaned_month,
            reporting_quarter=cleaned_quarter,
            reporting_period=reporting_period,
            value=value,
            submitted_by=(
                cleaned_submitted_by
                or "SHA Coordinator"
            ),
            notes=cleaned_notes,
            supporting_document_id=(
                supporting_document_id
            ),
        )

        db.add(sha_report)
        db.commit()
        db.refresh(sha_report)

        document_url = (
            f"/documents/{supporting_document_id}"
            if supporting_document_id
            else ""
        )

        return {
            "success": True,
            "message": (
                "SHA report submitted successfully."
            ),
            "report": {
                "report_id": str(
                    sha_report.report_id
                ),
                "report_type": (
                    sha_report.report_type
                ),
                "frequency": sha_report.frequency,
                "reporting_year": (
                    sha_report.reporting_year
                ),
                "reporting_month": (
                    sha_report.reporting_month or ""
                ),
                "reporting_quarter": (
                    sha_report.reporting_quarter or ""
                ),
                "reporting_period": (
                    sha_report.reporting_period
                ),
                "value": float(
                    sha_report.value or 0
                ),
                "submitted_by": (
                    sha_report.submitted_by or ""
                ),
                "notes": sha_report.notes or "",
                "supporting_document": (
                    document_url
                ),
                "submitted_at": (
                    format_database_datetime(
                        sha_report.submitted_at
                    )
                ),
            },
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "The SHA report could not be saved."
            ),
        ) from exc
    
@app.post("/submit-record")
async def submit_record(
    mfl_code: str = Form(...),
    amount_received: float = Form(...),
    funding_source: str = Form(...),
    reporting_period: str = Form(...),
    procurement_source: str = Form(""),
    date_received: str = Form(""),
    amount_allocated_to_hpt: float = Form(...),
    amount_spent_on_hpt: float = Form(...),
    amount_used_for_chp_kits: float = Form(0),
    submitted_by: str = Form("facility_user"),
    submitter_phone: str = Form(""),
    supporting_document: UploadFile | None = File(None),
    current_user: User = Depends(
        require_roles("facility", "admin")
    ),
    db: Session = Depends(get_db),
):
    normalized_mfl = normalize_mfl_code(
        mfl_code
    )

    enforce_facility_scope(
        current_user,
        normalized_mfl,
    )

    normalized_period = str(
        reporting_period
    ).strip()

    if not normalized_mfl:
        raise HTTPException(
            status_code=400,
            detail="A valid MFL code is required.",
        )

    if not normalized_period:
        raise HTTPException(
            status_code=400,
            detail="Reporting period is required.",
        )

    existing_record = (
        db.query(HPTRecord)
        .filter(
            HPTRecord.mfl_code == normalized_mfl,
            HPTRecord.reporting_period
            == normalized_period,
        )
        .first()
    )

    if existing_record:
        raise HTTPException(
            status_code=409,
            detail=(
                "This facility has already submitted "
                "a record for the selected reporting "
                "period."
            ),
        )

    try:
        supporting_document_id = None

        if (
            supporting_document
            and supporting_document.filename
        ):
            if (
                supporting_document.content_type
                != "application/pdf"
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Only PDF documents are allowed."
                    ),
                )

            file_bytes = await supporting_document.read()

            if not file_bytes:
                raise HTTPException(
                    status_code=400,
                    detail="The uploaded PDF is empty.",
                )

            if len(file_bytes) > MAX_DOCUMENT_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "The PDF must not exceed 10 MB."
                    ),
                )

            document = SupportingDocument(
                original_filename=(
                    supporting_document.filename
                    or "supporting_document.pdf"
                ),
                content_type=(
                    supporting_document.content_type
                    or "application/pdf"
                ),
                file_size=len(file_bytes),
                file_data=file_bytes,
                uploaded_by=submitted_by,
            )

            db.add(document)
            db.flush()

            supporting_document_id = document.id

        record = HPTRecord(
            mfl_code=normalized_mfl,
            reporting_period=normalized_period,
            amount_received=amount_received,
            funding_source=funding_source.strip(),
            procurement_source=(
                procurement_source.strip()
            ),
            date_received=date_received.strip(),
            amount_allocated_to_hpt=(
                amount_allocated_to_hpt
            ),
            amount_spent_on_hpt=(
                amount_spent_on_hpt
            ),
            amount_used_for_chp_kits=(
                amount_used_for_chp_kits
            ),
            supporting_document_id=(
                supporting_document_id
            ),
            submitted_by=submitted_by.strip(),
            submitter_phone=(
                submitter_phone.strip()
            ),
            review_status="Pending",
        )

        db.add(record)
        db.commit()
        db.refresh(record)

        document_url = (
            f"/documents/{supporting_document_id}"
            if supporting_document_id
            else ""
        )

        return {
            "message": (
                "Record submitted successfully"
            ),
            "record": {
                "record_id": record.record_id,
                "mfl_code": record.mfl_code,
                "reporting_period": (
                    record.reporting_period
                ),
                "amount_received": (
                    record.amount_received
                ),
                "funding_source": (
                    record.funding_source
                ),
                "procurement_source": (
                    record.procurement_source or ""
                ),
                "date_received": (
                    record.date_received
                ),
                "amount_allocated_to_hpt": (
                    record.amount_allocated_to_hpt
                ),
                "amount_spent_on_hpt": (
                    record.amount_spent_on_hpt
                ),
                "amount_used_for_chp_kits": (
                    record.amount_used_for_chp_kits
                ),
                "supporting_document": (
                    document_url
                ),
                "submitted_by": (
                    record.submitted_by or ""
                ),
                "submitter_phone": (
                    record.submitter_phone or ""
                ),
                "review_status": (
                    record.review_status
                ),
            },
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "The submission could not be saved."
            ),
        ) from exc
    
@app.get("/documents/{document_id}")
def view_supporting_document(
    document_id: int,
    current_user: User = Depends(
        require_roles("facility", "county", "admin")
    ),
    db: Session = Depends(get_db),
):
    document = (
        db.query(SupportingDocument)
        .filter(SupportingDocument.id == document_id)
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Supporting document not found.",
        )

    if current_user.role == "facility":
        facility_record = (
            db.query(HPTRecord)
            .filter(
                HPTRecord.supporting_document_id
                == document_id
            )
            .first()
        )

        if not facility_record:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You do not have permission to "
                    "access this document."
                ),
            )

        enforce_facility_scope(
            current_user,
            facility_record.mfl_code,
        )

    safe_filename = (
        document.original_filename
        or "supporting_document.pdf"
    ).replace('"', "")

    return Response(
        content=document.file_data,
        media_type=(
            document.content_type
            or "application/pdf"
        ),
        headers={
            "Content-Disposition": (
                f'inline; filename="{safe_filename}"'
            )
        },
    )
@app.patch("/records/review")
def review_submission(
    payload: ReviewRecordRequest,
    current_user: User = Depends(
        require_roles("county", "admin")
    ),
    db: Session = Depends(get_db),
):
    review_reason = payload.review_reason.strip()

    if (
        payload.review_status == "Rejected"
        and not review_reason
    ):
        raise HTTPException(
            status_code=400,
            detail="A rejection reason is required.",
        )

    normalized_mfl = normalize_mfl_code(
        payload.mfl_code
    )

    normalized_period = str(
        payload.reporting_period
    ).strip()

    record = (
        db.query(HPTRecord)
        .filter(
            HPTRecord.mfl_code == normalized_mfl,
            HPTRecord.reporting_period == normalized_period,
        )
        .order_by(HPTRecord.record_id.desc())
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail=(
                "The submission could not be found for "
                f"MFL {payload.mfl_code} and reporting period "
                f"{payload.reporting_period}."
            ),
        )

    saved_reason = (
        review_reason
        if payload.review_status == "Rejected"
        else ""
    )

    reviewed_by = (
        f"{current_user.first_name} "
        f"{current_user.last_name}"
    ).strip()

    if not reviewed_by:
        reviewed_by = current_user.email

    reviewed_at = datetime.now()

    record.review_status = payload.review_status
    record.review_reason = saved_reason
    record.reviewed_by = reviewed_by
    record.reviewed_at = reviewed_at

    try:
        db.commit()
        db.refresh(record)

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="The review could not be saved.",
        ) from exc

    return {
        "success": True,
        "message": (
            f"Submission "
            f"{payload.review_status.lower()} successfully."
        ),
        "review_status": record.review_status,
        "review_reason": record.review_reason or "",
        "reviewed_by": record.reviewed_by or "",
        "reviewed_at": format_database_datetime(
            record.reviewed_at
        ),
        "record": {
            "record_id": record.record_id,
            "mfl_code": record.mfl_code,
            "reporting_period": record.reporting_period,
            "review_status": record.review_status,
            "review_reason": record.review_reason or "",
            "reviewed_by": record.reviewed_by or "",
            "reviewed_at": format_database_datetime(
                record.reviewed_at
            ),
        },
    }

@app.post("/records/replace-document")
async def replace_supporting_document(
    mfl_code: str = Form(...),
    reporting_period: str = Form(...),
    supporting_document: UploadFile = File(...),
    current_user: User = Depends(
        require_roles("facility", "admin")
    ),
    db: Session = Depends(get_db),
):
    if (
        supporting_document.content_type
        != "application/pdf"
    ):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed.",
        )

    file_bytes = await supporting_document.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded PDF is empty.",
        )

    if len(file_bytes) > MAX_DOCUMENT_SIZE:
        raise HTTPException(
            status_code=400,
            detail="The PDF must not exceed 10 MB.",
        )

    normalized_mfl = normalize_mfl_code(
        mfl_code
    )

    enforce_facility_scope(
        current_user,
        normalized_mfl,
    )

    normalized_period = str(
        reporting_period
    ).strip()

    record = (
        db.query(HPTRecord)
        .filter(
            HPTRecord.mfl_code == normalized_mfl,
            HPTRecord.reporting_period
            == normalized_period,
        )
        .order_by(HPTRecord.record_id.desc())
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Submission record not found.",
        )

    try:
        document = SupportingDocument(
            original_filename=(
                supporting_document.filename
                or "supporting_document.pdf"
            ),
            content_type=(
                supporting_document.content_type
                or "application/pdf"
            ),
            file_size=len(file_bytes),
            file_data=file_bytes,
            uploaded_by=mfl_code,
        )

        db.add(document)
        db.flush()

        record.supporting_document_id = document.id
        record.review_status = "Resubmitted"
        record.review_reason = ""
        record.reviewed_by = None
        record.reviewed_at = None

        db.commit()
        db.refresh(record)

        return {
            "success": True,
            "message": (
                "Supporting document replaced "
                "successfully."
            ),
            "document_id": document.id,
            "supporting_document": (
                f"/documents/{document.id}"
            ),
            "review_status": (
                record.review_status
            ),
        }

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "The supporting document could "
                "not be replaced."
            ),
        ) from exc
