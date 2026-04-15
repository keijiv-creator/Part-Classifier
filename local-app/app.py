import streamlit as st
import subprocess
import sys
import json
import os
import glob
import tempfile
import shutil
from datetime import datetime
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
RUNS_DIR = os.path.join(SCRIPT_DIR, "runs")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
ANALYSIS_SCRIPT = os.path.join(DATA_DIR, "combine_parts_analysis.py")

os.makedirs(RUNS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

st.set_page_config(
    page_title="National Pipeline Manager",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    .kpi-card {
        background: white;
        border-radius: 10px;
        padding: 16px 20px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        border-left: 4px solid #1B2A4A;
        margin-bottom: 8px;
    }
    .kpi-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        margin-bottom: 4px;
    }
    .kpi-value {
        font-size: 26px;
        font-weight: 700;
        color: #1B2A4A;
        line-height: 1.1;
    }
    .kpi-sub {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 3px;
    }
    .run-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 6px;
    }
    .run-date {
        font-size: 13px;
        font-weight: 600;
        color: #1B2A4A;
    }
    .run-meta {
        font-size: 11px;
        color: #6b7280;
    }
    .historical-banner {
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 8px;
        padding: 10px 16px;
        margin-bottom: 16px;
        color: #92400e;
        font-size: 14px;
    }
    .section-header {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
        margin: 16px 0 8px 0;
    }
    [data-testid="stSidebar"] {
        background-color: #1B2A4A;
    }
    [data-testid="stSidebar"] * {
        color: white !important;
    }
    [data-testid="stSidebar"] .stButton > button {
        background: rgba(255,255,255,0.12);
        color: white !important;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        font-size: 13px;
    }
    [data-testid="stSidebar"] .stButton > button:hover {
        background: rgba(255,255,255,0.2);
    }
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] .stSelectbox label,
    [data-testid="stSidebar"] .stNumberInput label,
    [data-testid="stSidebar"] .stSlider label,
    [data-testid="stSidebar"] .stDateInput label,
    [data-testid="stSidebar"] p {
        color: rgba(255,255,255,0.75) !important;
        font-size: 13px !important;
    }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3 {
        color: white !important;
    }
    div[data-testid="stFileUploader"] label {
        color: rgba(255,255,255,0.75) !important;
    }
    .stTabs [data-baseweb="tab"] {
        font-size: 14px;
    }
</style>
""", unsafe_allow_html=True)


def fmt_currency(v):
    if v is None:
        return "$0"
    v = float(v)
    if abs(v) >= 1_000_000:
        return f"${v/1_000_000:.1f}M"
    if abs(v) >= 1_000:
        return f"${v/1_000:.0f}K"
    return f"${v:,.0f}"


def fmt_number(v):
    if v is None:
        return "0"
    return f"{int(v):,}"


def kpi_card(label, value, sub=None, accent="#1B2A4A"):
    sub_html = f'<div class="kpi-sub">{sub}</div>' if sub else ""
    return f"""
    <div class="kpi-card" style="border-left-color:{accent};">
        <div class="kpi-label">{label}</div>
        <div class="kpi-value">{value}</div>
        {sub_html}
    </div>
    """


def load_runs():
    runs = []
    for path in sorted(glob.glob(os.path.join(RUNS_DIR, "run_*.json")), reverse=True):
        try:
            with open(path) as f:
                data = json.load(f)
            data["_path"] = path
            data["_filename"] = os.path.basename(path)
            runs.append(data)
        except Exception:
            pass
    return runs


def save_run(result_data, report_date, cutoff_year):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    fname = f"run_{ts}.json"
    fpath = os.path.join(RUNS_DIR, fname)
    result_data["_report_date"] = report_date
    result_data["_cutoff_year"] = cutoff_year
    result_data["_saved_at"] = datetime.now().isoformat()
    with open(fpath, "w") as f:
        json.dump(result_data, f, default=str)
    return fpath


def run_analysis(national_path, booking_path, cutoff_year, fai_threshold):
    json_out = os.path.join(tempfile.mkdtemp(), "result.json")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    excel_out_dir = OUTPUT_DIR

    cmd = [
        sys.executable, ANALYSIS_SCRIPT,
        "--national-file", national_path,
        "--booking-file", booking_path,
        "--output-dir", excel_out_dir,
        "--cutoff-year", str(cutoff_year),
        "--fai-threshold", str(fai_threshold),
        "--json-output", json_out,
    ]

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=SCRIPT_DIR,
    )

    if proc.returncode != 0:
        raise RuntimeError(proc.stdout + "\n" + proc.stderr)

    with open(json_out) as f:
        result = json.load(f)

    return result, proc.stdout


def render_kpi_row(summary):
    cols = st.columns(6)
    with cols[0]:
        st.markdown(kpi_card("Unique Parts", fmt_number(summary.get("total_unique_parts"))), unsafe_allow_html=True)
    with cols[1]:
        st.markdown(kpi_card(
            "New Deals", fmt_number(summary.get("new_deals_count")),
            f"Avg {fmt_currency(summary.get('avg_deal_value_new'))}", "#059669"
        ), unsafe_allow_html=True)
    with cols[2]:
        st.markdown(kpi_card(
            "PD Deals", fmt_number(summary.get("pd_info_count")),
            f"Avg {fmt_currency(summary.get('avg_deal_value_pd'))}", "#7c3aed"
        ), unsafe_allow_html=True)
    with cols[3]:
        st.markdown(kpi_card(
            "Pipeline Value", fmt_currency(summary.get("total_pd_pipeline_value")),
            sub=None, accent="#0ea5e9"
        ), unsafe_allow_html=True)
    with cols[4]:
        st.markdown(kpi_card(
            "Won Deals", fmt_number(summary.get("won_deals_count")),
            fmt_currency(summary.get("won_deals_value")), "#16a34a"
        ), unsafe_allow_html=True)
    with cols[5]:
        st.markdown(kpi_card(
            "Open Pipeline", fmt_number(summary.get("open_deals_count")),
            fmt_currency(summary.get("open_deals_value")), "#d97706"
        ), unsafe_allow_html=True)


def render_charts(analytics):
    col_left, col_right = st.columns(2)

    with col_left:
        calc = analytics.get("calc_label_distribution", {})
        if calc:
            fig = px.pie(
                names=list(calc.keys()),
                values=list(calc.values()),
                title="Deal Classification (New Deals)",
                hole=0.4,
                color_discrete_sequence=px.colors.qualitative.Set2,
            )
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=300)
            st.plotly_chart(fig, use_container_width=True)

    with col_right:
        platform_rev = analytics.get("platform_revenue", {})
        if platform_rev:
            items = sorted(platform_rev.items(), key=lambda x: x[1], reverse=True)
            fig = px.bar(
                x=[i[0] for i in items],
                y=[i[1] for i in items],
                title="Pipeline Value by Platform",
                labels={"x": "Platform", "y": "Value ($)"},
                color_discrete_sequence=["#1B2A4A"],
            )
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=300)
            st.plotly_chart(fig, use_container_width=True)

    col_l2, col_r2 = st.columns(2)
    with col_l2:
        status_dist = analytics.get("pd_status_distribution", {})
        if status_dist:
            fig = px.pie(
                names=list(status_dist.keys()),
                values=list(status_dist.values()),
                title="PD Deal Status Distribution",
                hole=0.4,
                color_discrete_sequence=px.colors.qualitative.Pastel,
            )
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=280)
            st.plotly_chart(fig, use_container_width=True)

    with col_r2:
        industry = analytics.get("industry_distribution", {})
        if industry:
            items = sorted(industry.items(), key=lambda x: x[1], reverse=True)
            fig = px.bar(
                x=[i[0] for i in items],
                y=[i[1] for i in items],
                title="Industry Distribution (PD Deals)",
                labels={"x": "Industry", "y": "Count"},
                color_discrete_sequence=["#7c3aed"],
            )
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=280)
            st.plotly_chart(fig, use_container_width=True)


def render_top_customers(analytics):
    col_l, col_r = st.columns(2)
    with col_l:
        top_new = analytics.get("top_customers_new", [])
        if top_new:
            st.markdown("**Top Customers — New Deals (by Revenue)**")
            df = pd.DataFrame(top_new)
            df.columns = ["Customer", "Revenue"]
            df["Revenue"] = df["Revenue"].apply(fmt_currency)
            st.dataframe(df, use_container_width=True, hide_index=True)
    with col_r:
        top_pd = analytics.get("top_customers_pd", [])
        if top_pd:
            st.markdown("**Top Customers — PD Deals (by Pipeline Value)**")
            df = pd.DataFrame(top_pd)
            df.columns = ["Customer", "Pipeline Value"]
            df["Pipeline Value"] = df["Pipeline Value"].apply(fmt_currency)
            st.dataframe(df, use_container_width=True, hide_index=True)


def render_results(result, is_historical=False, run_label=None):
    summary = result.get("summary", {})
    analytics = result.get("analytics", {})
    sheets = result.get("sheets", {})
    output_file = result.get("output_file")
    elapsed = result.get("elapsed_seconds")

    if is_historical:
        report_date = result.get("_report_date", "")
        saved_at = result.get("_saved_at", "")
        st.markdown(
            f'<div class="historical-banner">🕐 Viewing historical run — '
            f'Report date: <strong>{report_date}</strong>'
            f'{(" · Saved: " + saved_at[:10]) if saved_at else ""}'
            f' · Downloads disabled for historical runs</div>',
            unsafe_allow_html=True,
        )
    else:
        info_parts = []
        if elapsed:
            info_parts.append(f"Analysis completed in {elapsed}s")
        if run_label:
            info_parts.append(run_label)
        if info_parts:
            st.caption(" · ".join(info_parts))

    tab_dash, tab_new, tab_pd, tab_parts = st.tabs([
        "📊 Dashboard", "🔍 New Deals", "📋 PD Info", "📦 All Parts"
    ])

    with tab_dash:
        st.markdown("### Key Metrics")
        render_kpi_row(summary)
        st.markdown("### Charts")
        render_charts(analytics)
        st.markdown("### Top Customers")
        render_top_customers(analytics)
        st.markdown("---")
        col_a, col_b, col_c, col_d = st.columns(4)
        with col_a:
            st.metric("LANDMARK Parts", fmt_number(summary.get("landmark_parts_count")))
        with col_b:
            st.metric("PD Cache Entries", fmt_number(summary.get("pd_cache_entries")))
        with col_c:
            st.metric("New Deals Revenue", fmt_currency(summary.get("total_new_deals_revenue")))
        with col_d:
            st.metric("Won Deal Value", fmt_currency(summary.get("won_deals_value")))

        if not is_historical and output_file and os.path.exists(output_file):
            st.markdown("---")
            with open(output_file, "rb") as f:
                st.download_button(
                    label="⬇️ Download Parts Analysis Excel",
                    data=f.read(),
                    file_name=os.path.basename(output_file),
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    type="primary",
                )

    with tab_new:
        new_deals = sheets.get("new_deals", [])
        if new_deals:
            df = pd.DataFrame(new_deals)
            display_cols = [c for c in [
                "name", "customer_part_id", "mapped_status", "mapped_probability",
                "mapped_med_rev", "calc_label", "mapped_pd_p2_time", "first_order_date",
            ] if c in df.columns]
            df_disp = df[display_cols].copy() if display_cols else df
            rename = {
                "name": "Customer", "customer_part_id": "Part ID",
                "mapped_status": "Status", "mapped_probability": "Probability",
                "mapped_med_rev": "Revenue", "calc_label": "Label",
                "mapped_pd_p2_time": "P2 Time", "first_order_date": "First Order",
            }
            df_disp = df_disp.rename(columns={k: v for k, v in rename.items() if k in df_disp.columns})
            if "Revenue" in df_disp.columns:
                df_disp["Revenue"] = df_disp["Revenue"].apply(lambda v: fmt_currency(v) if v else "$0")
            st.markdown(f"**{len(new_deals):,} New Deals**")
            st.dataframe(df_disp, use_container_width=True, hide_index=True, height=450)
        else:
            st.info("No New Deals data in this run.")

    with tab_pd:
        pd_info = sheets.get("pd_info", [])
        if pd_info:
            df = pd.DataFrame(pd_info)
            display_cols = [c for c in [
                "pd_id", "org_name", "customer_part_id", "value", "status",
                "stage_id", "label", "platform_company", "deal_type", "industry",
            ] if c in df.columns]
            df_disp = df[display_cols].copy() if display_cols else df
            rename = {
                "pd_id": "PD ID", "org_name": "Customer", "customer_part_id": "Part ID",
                "value": "Value", "status": "Status", "stage_id": "Stage",
                "label": "Label", "platform_company": "Platform",
                "deal_type": "Deal Type", "industry": "Industry",
            }
            df_disp = df_disp.rename(columns={k: v for k, v in rename.items() if k in df_disp.columns})
            if "Value" in df_disp.columns:
                df_disp["Value"] = df_disp["Value"].apply(lambda v: fmt_currency(v) if v else "$0")
            st.markdown(f"**{len(pd_info):,} PD Info Deals**")
            st.dataframe(df_disp, use_container_width=True, hide_index=True, height=450)
        else:
            st.info("No PD Info data in this run.")

    with tab_parts:
        all_parts = sheets.get("all_unique_parts", [])
        if all_parts:
            df = pd.DataFrame(all_parts)
            st.markdown(f"**{len(all_parts):,} Unique Parts**")
            st.dataframe(df, use_container_width=True, hide_index=True, height=450)
        else:
            st.info("No All Unique Parts data in this run.")


def main():
    if "current_result" not in st.session_state:
        st.session_state.current_result = None
    if "is_historical" not in st.session_state:
        st.session_state.is_historical = False
    if "run_label" not in st.session_state:
        st.session_state.run_label = None
    if "runs" not in st.session_state:
        st.session_state.runs = load_runs()

    with st.sidebar:
        st.markdown("## 📊 National Pipeline\n**Manager** — Local")
        st.markdown("---")

        st.markdown('<div class="section-header">New Analysis</div>', unsafe_allow_html=True)

        national_file = st.file_uploader(
            "National QuoteData (.xlsx)", type=["xlsx"], key="national_upload"
        )
        booking_file = st.file_uploader(
            "Development Booking (.xlsx)", type=["xlsx"], key="booking_upload"
        )

        cutoff_year = st.number_input(
            "Quote Cutoff Year", min_value=2015, max_value=2035, value=2021, step=1
        )
        fai_threshold = st.slider(
            "FAI Threshold", min_value=0.0, max_value=1.0, value=0.50, step=0.05
        )
        report_date = st.date_input(
            "Report Date", value=datetime.today()
        )

        run_ready = national_file is not None and booking_file is not None

        if st.button(
            "▶ Run Analysis",
            disabled=not run_ready,
            type="primary" if run_ready else "secondary",
            use_container_width=True,
        ):
            with st.spinner("Running analysis... this may take a minute"):
                tmpdir = tempfile.mkdtemp()
                try:
                    nat_path = os.path.join(tmpdir, "National_QuoteData.xlsx")
                    book_path = os.path.join(tmpdir, "Development_Booking.xlsx")
                    with open(nat_path, "wb") as f:
                        f.write(national_file.getbuffer())
                    with open(book_path, "wb") as f:
                        f.write(booking_file.getbuffer())

                    result, stdout = run_analysis(
                        nat_path, book_path,
                        int(cutoff_year), float(fai_threshold),
                    )

                    rdate = str(report_date)
                    save_run(result, rdate, int(cutoff_year))

                    st.session_state.current_result = result
                    st.session_state.is_historical = False
                    st.session_state.run_label = f"Report Date: {rdate}"
                    st.session_state.runs = load_runs()
                    st.success("Analysis complete!")
                    st.rerun()

                except Exception as e:
                    st.error(f"Analysis failed:\n\n{e}")
                finally:
                    shutil.rmtree(tmpdir, ignore_errors=True)

        st.markdown("---")
        st.markdown('<div class="section-header">Run History</div>', unsafe_allow_html=True)

        runs = st.session_state.runs
        if not runs:
            st.caption("No past runs yet.")
        else:
            for i, run in enumerate(runs):
                rdate = run.get("_report_date", run.get("_saved_at", "")[:10] or f"Run {i+1}")
                s = run.get("summary", {})
                parts = s.get("total_unique_parts", 0)
                new_d = s.get("new_deals_count", 0)
                pd_d = s.get("pd_info_count", 0)
                pipeline = fmt_currency(s.get("total_pd_pipeline_value", 0))

                with st.container():
                    col_info, col_btn = st.columns([3, 1])
                    with col_info:
                        st.markdown(
                            f"**{rdate}**  \n"
                            f"<span style='font-size:11px;color:rgba(255,255,255,0.6)'>"
                            f"{parts:,} parts · {new_d} new · {pd_d} PD · {pipeline}</span>",
                            unsafe_allow_html=True,
                        )
                    with col_btn:
                        if st.button("Load", key=f"load_run_{i}", use_container_width=True):
                            st.session_state.current_result = run
                            st.session_state.is_historical = True
                            st.session_state.run_label = rdate
                            st.rerun()

        if runs:
            st.markdown("---")
            if st.button("🗑 Clear All History", use_container_width=True):
                st.session_state._confirm_clear = True

            if st.session_state.get("_confirm_clear"):
                st.warning("This will delete all saved runs. Are you sure?")
                col_y, col_n = st.columns(2)
                with col_y:
                    if st.button("Yes, clear", type="primary", use_container_width=True):
                        for run in runs:
                            try:
                                os.remove(run["_path"])
                            except Exception:
                                pass
                        st.session_state.runs = []
                        st.session_state.current_result = None
                        st.session_state.is_historical = False
                        st.session_state._confirm_clear = False
                        st.rerun()
                with col_n:
                    if st.button("Cancel", use_container_width=True):
                        st.session_state._confirm_clear = False
                        st.rerun()

    if st.session_state.current_result:
        if st.session_state.is_historical:
            col_head, col_back = st.columns([5, 1])
            with col_head:
                st.title("📊 National Pipeline Manager")
            with col_back:
                if st.button("← New Run"):
                    st.session_state.current_result = None
                    st.session_state.is_historical = False
                    st.rerun()
        else:
            st.title("📊 National Pipeline Manager")

        render_results(
            st.session_state.current_result,
            is_historical=st.session_state.is_historical,
            run_label=st.session_state.run_label,
        )
    else:
        st.title("📊 National Pipeline Manager")
        st.markdown("#### Local Analysis Tool")
        st.markdown("""
        Upload your source files in the sidebar to get started.

        ---
        **Steps:**
        1. Upload **National QuoteData** (.xlsx) in the sidebar
        2. Upload **Development Booking** (.xlsx) in the sidebar
        3. Set the cutoff year, FAI threshold, and report date
        4. Click **▶ Run Analysis**

        Results will appear here with KPI cards, charts, and scrollable data tables.
        Each run is automatically saved to the `runs/` folder for future reference.

        ---
        **What this does:**
        - Generates **Natman Bookings** and **National PDSync** outputs
        - Matches parts against the bundled Pipedrive deal cache
        - Produces a **Parts Analysis Excel** with All_Unique_Parts, New_Deals, and PD_Info sheets
        - Stores results locally as JSON — no internet connection required
        """)

        runs = st.session_state.runs
        if runs:
            st.markdown("---")
            st.markdown(f"**{len(runs)} past run(s) available** — click **Load** in the sidebar to view them.")


if __name__ == "__main__":
    main()
