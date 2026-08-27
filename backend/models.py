from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Text,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)

    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    role = Column(String, nullable=False)

    facility_mfl_code = Column(String, nullable=True)
    facility_name = Column(String, nullable=True)
    subcounty_name = Column(String, nullable=True)

    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class SupportingDocument(Base):
    __tablename__ = "supporting_documents"

    id = Column(Integer, primary_key=True, index=True)

    original_filename = Column(
        String(255),
        nullable=False,
    )

    content_type = Column(
        String(100),
        nullable=False,
    )

    file_size = Column(
        Integer,
        nullable=False,
    )

    file_data = Column(
        LargeBinary,
        nullable=False,
    )

    uploaded_by = Column(
        String(255),
        nullable=True,
    )

    uploaded_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

class HPTRecordDocument(Base):
    __tablename__ = "hpt_record_documents"

    id = Column(Integer, primary_key=True, index=True)

    record_id = Column(
        Integer,
        ForeignKey("hpt_records.record_id", ondelete="CASCADE"),
        nullable=False,
    )

    document_id = Column(
        Integer,
        ForeignKey("supporting_documents.id", ondelete="CASCADE"),
        nullable=False,
    )



class HPTRecord(Base):
    __tablename__ = "hpt_records"

    __table_args__ = (
        UniqueConstraint(
            "mfl_code",
            "reporting_period",
            name="uq_hpt_facility_reporting_period",
        ),
    )

    record_id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    mfl_code = Column(
        String(50),
        nullable=False,
        index=True,
    )

    reporting_period = Column(
        String(20),
        nullable=False,
        index=True,
    )

    financial_year = Column(
        String(20),
        nullable=True,
    )

    reporting_quarter = Column(
        String(2),
        nullable=True,
    )

    amount_received = Column(
        Float,
        nullable=False,
        default=0,
    )

    funding_source = Column(
        String(255),
        nullable=False,
    )

    procurement_source = Column(
        String(255),
        nullable=True,
    )

    date_received = Column(
        String(50),
        nullable=False,
    )

    amount_allocated_to_hpt = Column(
        Float,
        nullable=False,
        default=0,
    )

    amount_spent_on_hpt = Column(
        Float,
        nullable=False,
        default=0,
    )

    amount_used_for_chp_kits = Column(
        Float,
        nullable=False,
        default=0,
    )

    supporting_document_id = Column(
        Integer,
        ForeignKey(
            "supporting_documents.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    submitted_by = Column(
        String(255),
        nullable=True,
    )

    submitter_phone = Column(
        String(50),
        nullable=True,
    )

    submission_date = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    review_status = Column(
        String(50),
        nullable=False,
        default="Pending",
    )

    review_reason = Column(
        String(1000),
        nullable=True,
    )

    reviewed_by = Column(
        String(255),
        nullable=True,
    )

    reviewed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )


class SHAReport(Base):
    __tablename__ = "sha_reports"

    __table_args__ = (
        UniqueConstraint(
            "mfl_code",
            "report_type",
            "reporting_period",
            name="uq_sha_facility_type_period",
        ),
    )

    report_id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    mfl_code = Column(
        String(50),
        nullable=True,
        index=True,
    )

    report_type = Column(
        String(100),
        nullable=False,
        index=True,
    )

    frequency = Column(
        String(30),
        nullable=False,
    )

    reporting_year = Column(
        String(10),
        nullable=False,
        index=True,
    )

    financial_year = Column(
        String(20),
        nullable=True,
        index=True,
    )

    reporting_month = Column(
        String(20),
        nullable=True,
    )

    reporting_quarter = Column(
        String(10),
        nullable=True,
    )

    reporting_period = Column(
        String(50),
        nullable=False,
        index=True,
    )

    value = Column(
        Float,
        nullable=False,
        default=0,
    )

    submitted_by = Column(
        String(255),
        nullable=True,
    )

    notes = Column(
        Text,
        nullable=True,
    )

    supporting_document_id = Column(
        Integer,
        ForeignKey(
            "supporting_documents.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    submitted_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

class SHAReportDocument(Base):
    __tablename__ = "sha_report_documents"

    __table_args__ = (
        UniqueConstraint(
            "report_id",
            "document_id",
            name="uq_sha_report_document",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    report_id = Column(
        Integer,
        ForeignKey(
            "sha_reports.report_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    document_id = Column(
        Integer,
        ForeignKey(
            "supporting_documents.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
