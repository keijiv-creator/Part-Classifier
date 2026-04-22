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

PD_FILES = {
    "pd_cache.json": "Pipedrive deal cache (matched deal metadata)",
    "pd_deals_export.json": "Pipedrive deals export (full deal list)",
}
PD_STALE_DAYS = 7

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
    .historical-banner {
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 8px;
        padding: 10px 16px;
        margin-bottom: 16px;
        color: #92400e;
        font-size: 14px;
    }
    .diff-banner {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        padding: 10px 16px;
        margin-bottom: 16px;
        font-size: 14px;
        color: #1e3a8a;
    }
    .section-header {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
        margin: 16px 0 8px 0;
    }
    .diff-table-wrap {
        overflow-x: auto;
        overflow-y: auto;
        max-height: 520px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
    }
    .diff-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }
    .diff-table thead th {
        position: sticky;
        top: 0;
        background: #f9fafb;
        padding: 8px 12px;
        text-align: left;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6b7280;
        border-bottom: 1px solid #e5e7eb;
        white-space: nowrap;
    }
    .diff-table tbody td {
        padding: 6px 12px;
        white-space: nowrap;
        border-top: 1px solid #f3f4f6;
    }
    .badge {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
    }
    .badge-NEW      { background:#d1fae5; color:#065f46; border:1px solid #a7f3d0; }
    .badge-CHANGED  { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
    .badge-REMOVED  { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
    .badge-UNCHANGED{ background:#f3f4f6; color:#6b7280; border:1px solid #e5e7eb; }
    .change-detail  { font-size:10px; color:#92400e; margin-top:3px; line-height:1.4; }
    [data-testid="stSidebar"] { background-color: #1B2A4A; }
    [data-testid="stSidebar"] * { color: white !important; }
    [data-testid="stSidebar"] .stButton > button {
        background: rgba(255,255,255,0.12);
        color: white !important;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        font-size: 13px;
    }
    [data-testid="stSidebar"] .stButton > button:hover { background: rgba(255,255,255,0.2); }
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] p { color: rgba(255,255,255,0.75) !important; font-size: 13px !important; }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3 { color: white !important; }
    div[data-testid="stFileUploader"] label { color: rgba(255,255,255,0.75) !important; }
    .stTabs [data-baseweb="tab"] { font-size: 14px; }
</style>
""", unsafe_allow_html=True)


def check_pipedrive_files():
    """Return status info for each Pipedrive data file."""
    now = datetime.now().timestamp()
    results = {}
    for fname, description in PD_FILES.items():
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            results[fname] = {"present": False, "description": description, "mtime": None, "age_days": None, "stale": False}
        else:
            mtime = os.path.getmtime(fpath)
            age_days = (now - mtime) / 86400
            results[fname] = {
                "present": True,
                "description": description,
                "mtime": datetime.fromtimestamp(mtime),
                "age_days": age_days,
                "stale": age_days > PD_STALE_DAYS,
            }
    return results


def render_pd_file_warnings(pd_status, location="main"):
    """Render warnings for missing or stale Pipedrive data files.

    location='sidebar' uses compact single-line format;
    location='main' uses a fuller banner.
    """
    missing = [f for f, s in pd_status.items() if not s["present"]]
    stale = [f for f, s in pd_status.items() if s["present"] and s["stale"]]

    if not missing and not stale:
        return

    if location == "sidebar":
        if missing:
            names = " and ".join(f"`{f}`" for f in missing)
            st.warning(
                f"⚠️ {names} {'is' if len(missing) == 1 else 'are'} missing — "
                "Pipedrive enrichment will be skipped. See README for setup.",
                icon=None,
            )
        for fname in stale:
            s = pd_status[fname]
            age = int(s["age_days"])
            mtime_str = s["mtime"].strftime("%Y-%m-%d")
            st.warning(
                f"⚠️ `{fname}` is {age}d old (last updated {mtime_str}). "
                "PD data may be out of date.",
                icon=None,
            )
    else:
        if missing:
            names_list = "\n".join(f"- `{f}` — {pd_status[f]['description']}" for f in missing)
            st.warning(
                f"**Pipedrive data files missing**\n\n"
                f"The following file{'s are' if len(missing) > 1 else ' is'} absent from `local-app/data/`:\n\n"
                f"{names_list}\n\n"
                "Deal matching against Pipedrive will be **skipped**, leaving the "
                "`PD_Info` columns blank in the output. "
                "See the **README** for instructions on generating these files.",
            )
        for fname in stale:
            s = pd_status[fname]
            age = int(s["age_days"])
            mtime_str = s["mtime"].strftime("%Y-%m-%d %H:%M")
            st.warning(
                f"**`{fname}` may be out of date** — last modified {mtime_str} "
                f"({age} day{'s' if age != 1 else ''} ago). "
                f"PD enrichment will use stale data. "
                "See the **README** for instructions on refreshing Pipedrive data.",
            )


def render_pd_health_notice(pd_file_status):
    """Render a compact Pipedrive data-health notice inside the Dashboard tab.

    pd_file_status is the dict stored in result["_pd_file_status"] at run time.
    Shows nothing when the status is clean or when the key is absent (old runs).
    """
    if not pd_file_status:
        return

    missing = [f for f, s in pd_file_status.items() if not s.get("present")]
    stale = [
        (f, s) for f, s in pd_file_status.items()
        if s.get("present") and s.get("stale")
    ]

    if not missing and not stale:
        return

    parts = []
    if missing:
        names = " & ".join(f"`{f}`" for f in missing)
        parts.append(f"**{names} {'was' if len(missing) == 1 else 'were'} missing** — PD enrichment was skipped for this run")
    for fname, s in stale:
        age = s.get("age_days")
        age_str = f"{int(age)}d old" if age is not None else "stale"
        mtime = s.get("mtime")
        if mtime:
            try:
                mtime_str = datetime.fromisoformat(str(mtime)).strftime("%Y-%m-%d") if isinstance(mtime, str) else mtime.strftime("%Y-%m-%d")
                age_str = f"{int(age)}d old, last updated {mtime_str}"
            except Exception:
                pass
        parts.append(f"**`{fname}`** was {age_str} at run time — PD data may be out of date")

    notice = "  \n".join(f"⚠️ {p}" for p in parts)
    st.warning(notice, icon=None)


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
    cmd = [
        sys.executable, ANALYSIS_SCRIPT,
        "--national-file", national_path,
        "--booking-file", booking_path,
        "--output-dir", OUTPUT_DIR,
        "--cutoff-year", str(cutoff_year),
        "--fai-threshold", str(fai_threshold),
        "--json-output", json_out,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=SCRIPT_DIR)
    if proc.returncode != 0:
        raise RuntimeError(proc.stdout + "\n" + proc.stderr)
    with open(json_out) as f:
        result = json.load(f)
    return result, proc.stdout


def compute_diff(current_rows, prev_rows, compare_fields, rev_field):
    """Compare two lists of part-rows, returning each row annotated with _change_type."""
    def norm(r):
        return str(r.get("customer_part_id", "")).strip().upper()

    prev_map = {norm(r): r for r in prev_rows if norm(r)}
    curr_map = {norm(r): r for r in current_rows if norm(r)}

    rows = []
    added = removed = changed = unchanged = 0
    revenue_delta = 0.0

    for key, curr in curr_map.items():
        curr_rev = float(curr.get(rev_field, 0) or 0)
        prev = prev_map.get(key)
        if prev is None:
            rows.append({**curr, "_change_type": "NEW", "_changes": {}})
            added += 1
            revenue_delta += curr_rev
        else:
            field_changes = {}
            for field in compare_fields:
                old_v = str(prev.get(field, "") or "").strip()
                new_v = str(curr.get(field, "") or "").strip()
                if old_v != new_v:
                    field_changes[field] = (old_v, new_v)
            if field_changes:
                rows.append({**curr, "_change_type": "CHANGED", "_changes": field_changes})
                changed += 1
                revenue_delta += curr_rev - float(prev.get(rev_field, 0) or 0)
            else:
                rows.append({**curr, "_change_type": "UNCHANGED", "_changes": {}})
                unchanged += 1

    for key, prev in prev_map.items():
        if key not in curr_map:
            rows.append({**prev, "_change_type": "REMOVED", "_changes": {}})
            removed += 1
            revenue_delta -= float(prev.get(rev_field, 0) or 0)

    order = {"NEW": 0, "CHANGED": 1, "REMOVED": 2, "UNCHANGED": 3}
    rows.sort(key=lambda r: order.get(r.get("_change_type", "UNCHANGED"), 3))

    return {
        "rows": rows,
        "summary": {
            "added": added,
            "removed": removed,
            "changed": changed,
            "unchanged": unchanged,
            "revenue_delta": round(revenue_delta, 2),
        },
    }


def render_diff_banner(diff, prev_label):
    nd = diff["new_deals"]["summary"]
    pi = diff["pd_info"]["summary"]
    total_added   = nd["added"]   + pi["added"]
    total_removed = nd["removed"] + pi["removed"]
    total_changed = nd["changed"] + pi["changed"]
    net_rev = nd["revenue_delta"] + pi["revenue_delta"]
    sign = "+" if net_rev >= 0 else ""
    parts = [
        f"<b>+{total_added}</b> added",
        f"<b>{total_removed}</b> removed",
        f"<b>{total_changed}</b> changed",
        f"Net Δ Revenue: <b>{sign}{fmt_currency(net_rev)}</b>",
    ]
    st.markdown(
        f'<div class="diff-banner">🔄 vs <b>{prev_label}</b> &nbsp;·&nbsp; '
        + " &nbsp;·&nbsp; ".join(parts)
        + "</div>",
        unsafe_allow_html=True,
    )


def render_diff_table(rows, columns, table_key):
    """Render an HTML table with coloured change badges and filter buttons."""
    if not rows:
        st.info("No data.")
        return

    all_types = ["ALL", "NEW", "CHANGED", "REMOVED", "UNCHANGED"]
    counts = {"ALL": len(rows)}
    for ct in ["NEW", "CHANGED", "REMOVED", "UNCHANGED"]:
        counts[ct] = sum(1 for r in rows if r.get("_change_type") == ct)

    filter_key = f"diff_filter_{table_key}"
    if filter_key not in st.session_state:
        st.session_state[filter_key] = "ALL"

    btn_cols = st.columns(len(all_types))
    for i, ct in enumerate(all_types):
        with btn_cols[i]:
            label = f"{ct} ({counts[ct]})"
            is_sel = st.session_state[filter_key] == ct
            if st.button(
                label,
                key=f"btn_{table_key}_{ct}",
                type="primary" if is_sel else "secondary",
                use_container_width=True,
            ):
                st.session_state[filter_key] = ct
                st.rerun()

    selected = st.session_state[filter_key]
    filtered = rows if selected == "ALL" else [r for r in rows if r.get("_change_type") == selected]

    row_bg = {"NEW": "#f0fdf4", "CHANGED": "#fffbeb", "REMOVED": "#fef2f2", "UNCHANGED": "#ffffff"}
    numeric_fields = {"mapped_med_rev", "value"}

    def fmt_diff_val(field, raw):
        """Safely format a diff before/after value (raw is already a string)."""
        if field in numeric_fields:
            try:
                return fmt_currency(float(raw)) if raw else "(empty)"
            except (ValueError, TypeError):
                return raw or "(empty)"
        return raw or "(empty)"

    field_labels = {
        "mapped_status": "Status",
        "mapped_probability": "Probability",
        "mapped_med_rev": "Revenue",
        "calc_label": "Label",
        "value": "Value",
        "status": "PD Status",
        "stage_id": "Stage",
        "label": "PD Label",
        "platform_company": "Platform",
    }

    headers = ["Change"] + [col["label"] for col in columns]
    html = '<div class="diff-table-wrap"><table class="diff-table"><thead><tr>'
    html += "".join(f"<th>{h}</th>" for h in headers)
    html += "</tr></thead><tbody>"

    for row in filtered:
        ct = row.get("_change_type", "UNCHANGED")
        bg = row_bg.get(ct, "#ffffff")
        badge = f'<span class="badge badge-{ct}">{ct}</span>'

        changes = row.get("_changes", {})
        if ct == "CHANGED" and changes:
            detail_lines = []
            for field, (old_v, new_v) in changes.items():
                fl = field_labels.get(field, field)
                detail_lines.append(f"{fl}: {fmt_diff_val(field, old_v)} → {fmt_diff_val(field, new_v)}")
            badge += f'<div class="change-detail">{"<br>".join(detail_lines)}</div>'

        html += f'<tr style="background:{bg};">'
        html += f'<td style="vertical-align:top;">{badge}</td>'
        for col in columns:
            val = row.get(col["key"], "")
            fmt = col.get("format")
            cell = fmt(val) if fmt else (str(val) if val is not None else "")
            html += f"<td>{cell}</td>"
        html += "</tr>"

    html += "</tbody></table></div>"
    html += f'<p style="font-size:12px;color:#9ca3af;margin-top:6px;">{len(filtered):,} of {len(rows):,} rows</p>'
    st.markdown(html, unsafe_allow_html=True)


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
            fig = px.pie(names=list(calc.keys()), values=list(calc.values()),
                         title="Deal Classification (New Deals)", hole=0.4,
                         color_discrete_sequence=px.colors.qualitative.Set2)
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=300)
            st.plotly_chart(fig, use_container_width=True)

    with col_right:
        platform_rev = analytics.get("platform_revenue", {})
        if platform_rev:
            items = sorted(platform_rev.items(), key=lambda x: x[1], reverse=True)
            fig = px.bar(x=[i[0] for i in items], y=[i[1] for i in items],
                         title="Pipeline Value by Platform",
                         labels={"x": "Platform", "y": "Value ($)"},
                         color_discrete_sequence=["#1B2A4A"])
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=300)
            st.plotly_chart(fig, use_container_width=True)

    col_l2, col_r2 = st.columns(2)
    with col_l2:
        status_dist = analytics.get("pd_status_distribution", {})
        if status_dist:
            fig = px.pie(names=list(status_dist.keys()), values=list(status_dist.values()),
                         title="PD Deal Status Distribution", hole=0.4,
                         color_discrete_sequence=px.colors.qualitative.Pastel)
            fig.update_layout(margin=dict(t=40, b=0, l=0, r=0), height=280)
            st.plotly_chart(fig, use_container_width=True)

    with col_r2:
        industry = analytics.get("industry_distribution", {})
        if industry:
            items = sorted(industry.items(), key=lambda x: x[1], reverse=True)
            fig = px.bar(x=[i[0] for i in items], y=[i[1] for i in items],
                         title="Industry Distribution (PD Deals)",
                         labels={"x": "Industry", "y": "Count"},
                         color_discrete_sequence=["#7c3aed"])
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


def render_results(result, diff=None, is_historical=False, run_label=None):
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

    if diff and not is_historical:
        render_diff_banner(diff, diff.get("prev_label", "previous run"))

    new_deals_all = sheets.get("new_deals", [])
    pd_info_all = sheets.get("pd_info", [])

    nd_diff_rows = diff["new_deals"]["rows"] if diff else None
    pi_diff_rows = diff["pd_info"]["rows"] if diff else None

    nd_total = len(nd_diff_rows) if nd_diff_rows is not None else len(new_deals_all)
    pi_total = len(pi_diff_rows) if pi_diff_rows is not None else len(pd_info_all)

    nd_changes = (
        diff["new_deals"]["summary"]["added"]
        + diff["new_deals"]["summary"]["changed"]
        + diff["new_deals"]["summary"]["removed"]
        if diff else 0
    )
    pi_changes = (
        diff["pd_info"]["summary"]["added"]
        + diff["pd_info"]["summary"]["changed"]
        + diff["pd_info"]["summary"]["removed"]
        if diff else 0
    )

    nd_label = f"🔍 New Deals ({nd_total:,})" + (f" · {nd_changes} changes" if nd_changes else "")
    pi_label = f"📋 PD Info ({pi_total:,})" + (f" · {pi_changes} changes" if pi_changes else "")

    changes_rows = []
    if diff:
        for r in (diff.get("new_deals", {}).get("rows", []) or []):
            ct = r.get("_change_type", "")
            if ct and ct != "UNCHANGED":
                changes_rows.append({
                    "_change_type": ct,
                    "_source": "New Deals",
                    "customer_part_id": r.get("customer_part_id", ""),
                    "_customer": r.get("name", ""),
                    "_status": r.get("mapped_status", ""),
                    "_revenue": r.get("mapped_med_rev", 0),
                    "_label": r.get("calc_label", ""),
                })
        for r in (diff.get("pd_info", {}).get("rows", []) or []):
            ct = r.get("_change_type", "")
            if ct and ct != "UNCHANGED":
                changes_rows.append({
                    "_change_type": ct,
                    "_source": "PD Info",
                    "customer_part_id": r.get("customer_part_id", ""),
                    "_customer": r.get("org_name", ""),
                    "_status": r.get("status", ""),
                    "_revenue": r.get("value", 0),
                    "_label": r.get("label", ""),
                })

    has_changes = bool(changes_rows)
    changes_count = len(changes_rows)
    tab_labels = ["📊 Dashboard", nd_label, pi_label, "📦 All Parts"]
    if has_changes:
        tab_labels.append(f"🔄 Changes ({changes_count:,})")
    all_tabs = st.tabs(tab_labels)
    tab_dash = all_tabs[0]
    tab_new = all_tabs[1]
    tab_pd = all_tabs[2]
    tab_parts = all_tabs[3]
    tab_changes = all_tabs[4] if has_changes else None

    with tab_dash:
        st.markdown("### Key Metrics")
        render_kpi_row(summary)
        render_pd_health_notice(result.get("_pd_file_status"))
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

        if not is_historical:
            natman_file = result.get("natman_bookings_file")
            pdsync_file = result.get("pdsync_file")
            has_any = (
                (output_file and os.path.exists(output_file))
                or (natman_file and os.path.exists(natman_file))
                or (pdsync_file and os.path.exists(pdsync_file))
            )
            if has_any:
                st.markdown("---")
                dl_col1, dl_col2, dl_col3 = st.columns(3)
                if output_file and os.path.exists(output_file):
                    with dl_col1:
                        with open(output_file, "rb") as f:
                            st.download_button(
                                label="⬇️ Parts Analysis",
                                data=f.read(),
                                file_name=os.path.basename(output_file),
                                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                type="primary",
                                use_container_width=True,
                            )
                if natman_file and os.path.exists(natman_file):
                    with dl_col2:
                        with open(natman_file, "rb") as f:
                            st.download_button(
                                label="⬇️ Natman Bookings",
                                data=f.read(),
                                file_name=os.path.basename(natman_file),
                                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                use_container_width=True,
                            )
                if pdsync_file and os.path.exists(pdsync_file):
                    with dl_col3:
                        with open(pdsync_file, "rb") as f:
                            st.download_button(
                                label="⬇️ National PDSync",
                                data=f.read(),
                                file_name=os.path.basename(pdsync_file),
                                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                use_container_width=True,
                            )

    with tab_new:
        nd_cols = [
            {"key": "name",               "label": "Customer"},
            {"key": "customer_part_id",   "label": "Part ID"},
            {"key": "mapped_status",      "label": "Status"},
            {"key": "mapped_probability", "label": "Probability"},
            {"key": "mapped_med_rev",     "label": "Revenue",    "format": lambda v: fmt_currency(v) if v else "$0"},
            {"key": "calc_label",         "label": "Label"},
            {"key": "mapped_pd_p2_time",  "label": "P2 Time"},
            {"key": "first_order_date",   "label": "First Order"},
        ]
        if nd_diff_rows is not None:
            render_diff_table(nd_diff_rows, nd_cols, "new_deals")
        elif new_deals_all:
            df = pd.DataFrame(new_deals_all)[[
                c["key"] for c in nd_cols if c["key"] in pd.DataFrame(new_deals_all).columns
            ]]
            df = df.rename(columns={c["key"]: c["label"] for c in nd_cols})
            if "Revenue" in df.columns:
                df["Revenue"] = df["Revenue"].apply(lambda v: fmt_currency(v) if v else "$0")
            st.dataframe(df, use_container_width=True, hide_index=True, height=450)
        else:
            st.info("No New Deals data in this run.")

    with tab_pd:
        pi_cols = [
            {"key": "pd_id",            "label": "PD ID"},
            {"key": "org_name",         "label": "Customer"},
            {"key": "customer_part_id", "label": "Part ID"},
            {"key": "value",            "label": "Value",     "format": lambda v: fmt_currency(v) if v else "$0"},
            {"key": "status",           "label": "Status"},
            {"key": "stage_id",         "label": "Stage"},
            {"key": "label",            "label": "Label"},
            {"key": "platform_company", "label": "Platform"},
            {"key": "deal_type",        "label": "Deal Type"},
            {"key": "industry",         "label": "Industry"},
        ]
        if pi_diff_rows is not None:
            render_diff_table(pi_diff_rows, pi_cols, "pd_info")
        elif pd_info_all:
            df = pd.DataFrame(pd_info_all)
            display_cols = [c["key"] for c in pi_cols if c["key"] in df.columns]
            df = df[display_cols].rename(columns={c["key"]: c["label"] for c in pi_cols})
            if "Value" in df.columns:
                df["Value"] = df["Value"].apply(lambda v: fmt_currency(v) if v else "$0")
            st.dataframe(df, use_container_width=True, hide_index=True, height=450)
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

    if tab_changes is not None:
        with tab_changes:
            changes_cols = [
                {"key": "_source", "label": "Source"},
                {"key": "customer_part_id", "label": "Part ID"},
                {"key": "_customer", "label": "Customer"},
                {"key": "_status", "label": "Status"},
                {"key": "_revenue", "label": "Revenue / Value", "format": lambda v: fmt_currency(v) if v else "$0"},
                {"key": "_label", "label": "Label"},
            ]
            render_diff_table(changes_rows, changes_cols, "changes")


def main():
    if "current_result" not in st.session_state:
        st.session_state.current_result = None
    if "current_diff" not in st.session_state:
        st.session_state.current_diff = None
    if "is_historical" not in st.session_state:
        st.session_state.is_historical = False
    if "run_label" not in st.session_state:
        st.session_state.run_label = None
    if "runs" not in st.session_state:
        st.session_state.runs = load_runs()

    pd_status = check_pipedrive_files()

    with st.sidebar:
        st.markdown("## 📊 National Pipeline\n**Manager** — Local")
        st.markdown("---")

        render_pd_file_warnings(pd_status, location="sidebar")

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
        report_date = st.date_input("Report Date", value=datetime.today())

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
                    result["_pd_file_status"] = pd_status

                    all_runs_before = load_runs()
                    save_run(result, rdate, int(cutoff_year))
                    all_runs_after = load_runs()

                    diff = None
                    if all_runs_before:
                        prev_run = all_runs_before[0]
                        prev_label = prev_run.get("_report_date",
                                       prev_run.get("_saved_at", "")[:10] or "previous run")
                        prev_sheets = prev_run.get("sheets", {})
                        prev_nd = prev_sheets.get("new_deals", [])
                        prev_pi = prev_sheets.get("pd_info", [])

                        nd_diff = compute_diff(
                            result.get("sheets", {}).get("new_deals", []),
                            prev_nd,
                            ["mapped_status", "mapped_probability", "mapped_med_rev", "calc_label"],
                            "mapped_med_rev",
                        )
                        pi_diff = compute_diff(
                            result.get("sheets", {}).get("pd_info", []),
                            prev_pi,
                            ["value", "status", "stage_id", "label", "platform_company"],
                            "value",
                        )
                        diff = {
                            "new_deals": nd_diff,
                            "pd_info": pi_diff,
                            "prev_label": prev_label,
                        }

                    st.session_state.current_result = result
                    st.session_state.current_diff = diff
                    st.session_state.is_historical = False
                    st.session_state.run_label = f"Report Date: {rdate}"
                    st.session_state.runs = all_runs_after
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
                            st.session_state.current_diff = None
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
                        st.session_state.current_diff = None
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
                    st.session_state.current_diff = None
                    st.session_state.is_historical = False
                    st.rerun()
        else:
            st.title("📊 National Pipeline Manager")

        render_results(
            st.session_state.current_result,
            diff=st.session_state.current_diff,
            is_historical=st.session_state.is_historical,
            run_label=st.session_state.run_label,
        )
    else:
        st.title("📊 National Pipeline Manager")
        st.markdown("#### Local Analysis Tool")

        render_pd_file_warnings(pd_status, location="main")

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
        On your **second and subsequent runs**, the New Deals and PD Info tables will
        show colour-coded change badges (NEW / CHANGED / REMOVED / UNCHANGED) with
        filters, compared against your most recent previous run.

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
