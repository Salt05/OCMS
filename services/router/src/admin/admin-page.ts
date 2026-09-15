export function getAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OCMS Universal Router - Operations Dashboard & Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg-body: #F5F7FA;
      --bg-card: #FFFFFF;
      --bg-sidebar: #FFFFFF;
      --bg-subtle: #F8FAFC;
      --border-color: #E5E7EB;
      --border-subtle: #F1F5F9;
      --text-main: #111827;
      --text-secondary: #4B5563;
      --text-muted: #6B7280;
      --text-dim: #9CA3AF;
      --primary: #2563EB;
      --primary-hover: #1D4ED8;
      --primary-subtle: #EFF6FF;
      --success: #16A34A;
      --success-subtle: #DCFCE7;
      --success-border: #BBF7D0;
      --warning: #D97706;
      --warning-subtle: #FEF3C7;
      --warning-border: #FDE68A;
      --danger: #DC2626;
      --danger-subtle: #FEE2E2;
      --danger-border: #FECACA;
      --radius-sm: 6px;
      --radius: 8px;
      --radius-lg: 12px;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
      --sidebar-width: 250px;
      --topbar-height: 60px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-body);
      color: var(--text-main);
      line-height: 1.5;
      font-size: 13px;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* App Shell */
    .app-shell {
      display: flex;
      min-height: 100vh;
    }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-width);
      background-color: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 50;
    }
    .sidebar-header {
      height: var(--topbar-height);
      padding: 0 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sidebar-brand-icon {
      width: 34px;
      height: 34px;
      background: linear-gradient(135deg, #2563EB, #1D4ED8);
      color: #fff;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
    }
    .sidebar-brand-text h1 {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.2px;
    }
    .sidebar-brand-text p {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .version-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      padding: 1px 5px;
      border-radius: 4px;
      color: var(--primary);
      font-weight: 600;
    }

    .sidebar-nav {
      flex: 1;
      padding: 16px 12px;
      overflow-y: auto;
    }
    .nav-group-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      padding: 10px 12px 6px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.15s, color 0.15s;
      margin-bottom: 2px;
      user-select: none;
    }
    .nav-item:hover {
      background-color: var(--bg-subtle);
      color: var(--text-main);
    }
    .nav-item.active {
      background-color: var(--primary-subtle);
      color: var(--primary);
      font-weight: 600;
    }
    .nav-item .nav-icon {
      font-size: 16px;
      width: 20px;
      text-align: center;
      display: inline-block;
    }
    .nav-item .badge {
      margin-left: auto;
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
    }
    .badge-danger {
      background-color: var(--danger-subtle);
      color: var(--danger);
      border: 1px solid var(--danger-border);
    }
    .badge-primary {
      background-color: var(--primary-subtle);
      color: var(--primary);
    }

    .sidebar-footer {
      padding: 14px 16px;
      border-top: 1px solid var(--border-color);
      background-color: #FAFAFA;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .system-status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-success { background-color: var(--success); box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2); }
    .dot-warning { background-color: var(--warning); box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.2); }
    .dot-danger { background-color: var(--danger); box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2); }

    /* Main Content Wrapper */
    .main-wrapper {
      margin-left: var(--sidebar-width);
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    /* Topbar */
    .topbar {
      height: var(--topbar-height);
      background-color: #FFFFFF;
      border-bottom: 1px solid var(--border-color);
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .topbar-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
    }
    .env-badge-group {
      display: inline-flex;
      background-color: #F1F5F9;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 2px;
      gap: 2px;
    }
    .env-toggle-btn {
      border: none;
      background: none;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-muted);
      transition: background-color 0.15s, color 0.15s;
    }
    .env-toggle-btn.active.env-test {
      background-color: #FEF3C7;
      color: #B45309;
      box-shadow: var(--shadow-sm);
    }
    .env-toggle-btn.active.env-prod {
      background-color: #DCFCE7;
      color: #15803D;
      box-shadow: var(--shadow-sm);
    }

    .topbar-center {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .health-pill {
      font-size: 11px;
      font-weight: 500;
      padding: 4px 9px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border-color);
      background-color: #FFFFFF;
      color: var(--text-secondary);
    }
    .health-pill.healthy {
      background-color: #F0FDF4;
      border-color: var(--success-border);
      color: #15803D;
    }
    .health-pill.warning {
      background-color: #FFFBEB;
      border-color: var(--warning-border);
      color: #B45309;
    }
    .health-pill.error {
      background-color: #FEF2F2;
      border-color: var(--danger-border);
      color: #B91C1C;
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .last-update-text {
      font-size: 11px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }
    .auto-refresh-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
    }

    /* Buttons */
    .btn {
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      text-decoration: none;
      line-height: 1.4;
    }
    .btn-primary {
      background-color: var(--primary);
      color: #FFFFFF;
      box-shadow: var(--shadow-sm);
    }
    .btn-primary:hover {
      background-color: var(--primary-hover);
    }
    .btn-secondary {
      background-color: #FFFFFF;
      border-color: var(--border-color);
      color: var(--text-main);
      box-shadow: var(--shadow-sm);
    }
    .btn-secondary:hover {
      background-color: var(--bg-subtle);
      border-color: #D1D5DB;
    }
    .btn-danger {
      background-color: var(--danger-subtle);
      border-color: var(--danger-border);
      color: var(--danger);
    }
    .btn-danger:hover {
      background-color: #FEE2E2;
    }
    .btn-sm {
      font-size: 11px;
      padding: 4px 8px;
    }

    /* Main Body Area */
    .main-content {
      padding: 24px;
      flex: 1;
      max-width: 1600px;
      margin: 0 auto;
      width: 100%;
    }

    /* Cards */
    .card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
      padding: 18px 20px;
      margin-bottom: 20px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    @media (max-width: 1380px) {
      .kpi-grid { grid-template-columns: repeat(4, 1fr); }
    }
    @media (max-width: 860px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .kpi-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 14px 16px;
      box-shadow: var(--shadow-sm);
      position: relative;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .kpi-card:hover {
      box-shadow: var(--shadow);
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .kpi-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.1;
    }
    .kpi-sub {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .kpi-indicator {
      width: 4px;
      height: 100%;
      position: absolute;
      left: 0;
      top: 0;
    }

    /* Grid Layouts */
    .grid-2 {
      display: grid;
      grid-template-columns: 6.2fr 3.8fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .grid-equal {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    @media (max-width: 1024px) {
      .grid-2, .grid-equal { grid-template-columns: 1fr; }
    }

    /* Router Flow Visualization */
    .flow-canvas {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 12px;
      background: #FAFAFC;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      position: relative;
      overflow-x: auto;
      gap: 12px;
    }
    .flow-node {
      background-color: #FFFFFF;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 12px 14px;
      min-width: 170px;
      box-shadow: var(--shadow-sm);
      text-align: left;
      position: relative;
      flex-shrink: 0;
    }
    .flow-node-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .flow-node-title {
      font-weight: 700;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .flow-stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 3px;
    }
    .flow-stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: var(--text-main);
    }
    .flow-arrow {
      color: var(--text-dim);
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      background: #FFFFFF;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 12px;
    }
    th {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color);
      background-color: #F9FAFB;
      white-space: nowrap;
    }
    td {
      padding: 11px 14px;
      border-bottom: 1px solid var(--border-color);
      vertical-align: middle;
      color: var(--text-main);
    }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background-color: #F8FAFC; }
    .clickable-row { cursor: pointer; }

    /* Code Tags & Badges */
    .code-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background-color: #F3F4F6;
      border: 1px solid var(--border-color);
      padding: 2px 6px;
      border-radius: 4px;
      color: #1F2937;
      font-weight: 500;
      white-space: nowrap;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .status-badge.status-SUCCESS {
      background-color: var(--success-subtle);
      color: var(--success);
      border: 1px solid var(--success-border);
    }
    .status-badge.status-PROCESSING {
      background-color: var(--primary-subtle);
      color: var(--primary);
      border: 1px solid #BFDBFE;
    }
    .status-badge.status-RETRYING {
      background-color: var(--warning-subtle);
      color: var(--warning);
      border: 1px solid var(--warning-border);
    }
    .status-badge.status-FAILED {
      background-color: var(--danger-subtle);
      color: var(--danger);
      border: 1px solid var(--danger-border);
    }

    /* Queue Metrics Card */
    .queue-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .queue-card {
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 14px;
      background-color: #FFFFFF;
    }
    .queue-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .queue-name {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 13px;
    }
    .queue-stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      text-align: center;
    }
    .queue-stat-item {
      background-color: #F8FAFC;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 8px 4px;
    }
    .queue-stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
    }
    .queue-stat-lbl {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* Timeline Component */
    .timeline {
      position: relative;
      padding-left: 24px;
    }
    .timeline::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 6px;
      bottom: 6px;
      width: 2px;
      background-color: var(--border-color);
    }
    .timeline-item {
      position: relative;
      margin-bottom: 16px;
    }
    .timeline-item:last-child { margin-bottom: 0; }
    .timeline-point {
      position: absolute;
      left: -24px;
      top: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: #FFFFFF;
      border: 2px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
    }
    .timeline-point.completed { border-color: var(--success); color: var(--success); background-color: var(--success-subtle); }
    .timeline-point.processing { border-color: var(--primary); color: var(--primary); background-color: var(--primary-subtle); }
    .timeline-point.failed { border-color: var(--danger); color: var(--danger); background-color: var(--danger-subtle); }
    .timeline-point.waiting { border-color: var(--text-dim); color: var(--text-dim); }
    .timeline-content {
      font-size: 12px;
    }
    .timeline-time {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-dim);
      margin-bottom: 2px;
    }
    .timeline-title {
      font-weight: 600;
      color: var(--text-main);
    }
    .timeline-desc {
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Filter Toolbar */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .search-input {
      padding: 6px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-family: inherit;
      background-color: #FFFFFF;
      color: var(--text-main);
      width: 240px;
    }
    .search-input:focus {
      outline: none;
      border-color: var(--primary);
    }
    .select-input {
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      font-size: 12px;
      background-color: #FFFFFF;
      color: var(--text-main);
      font-family: inherit;
    }

    /* Switch toggle */
    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #CBD5E1;
      transition: .2s ease;
      border-radius: 20px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .2s ease;
      border-radius: 50%;
    }
    input:checked + .slider {
      background-color: var(--primary);
    }
    input:checked + .slider:before {
      transform: translateX(16px);
    }

    /* Drawer */
    .drawer-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(17, 24, 39, 0.4);
      backdrop-filter: blur(2px);
      z-index: 100;
      display: none;
      justify-content: flex-end;
    }
    .drawer-overlay.open { display: flex; }
    .drawer {
      width: 100%;
      max-width: 540px;
      background-color: #FFFFFF;
      height: 100%;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      animation: slideInRight 0.2s ease-out;
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .drawer-header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .drawer-body {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }
    .drawer-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border-color);
      background-color: #FAFAFA;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* Modals */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(17, 24, 39, 0.45);
      backdrop-filter: blur(2px);
      z-index: 110;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background-color: #FFFFFF;
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 500px;
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 700;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-body {
      padding: 20px;
    }
    .modal-footer {
      padding: 14px 20px;
      background-color: #F9FAFB;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Form Fields */
    .form-group {
      margin-bottom: 14px;
    }
    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 5px;
    }
    .form-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-family: inherit;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }
    .input-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Toast */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 16px;
      background-color: #1F2937;
      border-radius: var(--radius-sm);
      color: #FFFFFF;
      font-size: 12px;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s ease;
      pointer-events: none;
      z-index: 999;
    }
    #toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    /* Empty and Error states */
    .state-box {
      text-align: center;
      padding: 36px 20px;
      color: var(--text-muted);
    }
    .state-box-icon {
      font-size: 36px;
      margin-bottom: 10px;
      opacity: 0.8;
    }
    .state-box-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 4px;
    }

    /* Tab Panels */
    .tab-panel {
      display: none;
    }
    .tab-panel.active {
      display: block;
    }
  </style>
</head>
<body>

  <div class="app-shell">

    <!-- ── LEFT SIDEBAR ─────────────────────────────────────────────── -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand-icon">⚡</div>
        <div class="sidebar-brand-text">
          <h1>Universal Router</h1>
          <p>Control Center <span class="version-badge">v1.1</span></p>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-group-title">OVERVIEW</div>
        <a class="nav-item active" onclick="switchNav('dashboard')">
          <span class="nav-icon">📊</span>
          <span>Dashboard</span>
        </a>
        <a class="nav-item" onclick="switchNav('orders')">
          <span class="nav-icon">📦</span>
          <span>Đơn hàng</span>
        </a>
        <a class="nav-item" onclick="switchNav('flow')">
          <span class="nav-icon">🔀</span>
          <span>Event Flow</span>
        </a>

        <div class="nav-group-title">OPERATIONS</div>
        <a class="nav-item" onclick="switchNav('queues')">
          <span class="nav-icon">⚡</span>
          <span>Queue & Worker</span>
        </a>
        <a class="nav-item" onclick="switchNav('dlq')">
          <span class="nav-icon">🚨</span>
          <span>Dead Letter Queue</span>
          <span class="badge badge-danger" id="nav-dlq-badge" style="display:none;">0</span>
        </a>
        <a class="nav-item" onclick="switchNav('connections')">
          <span class="nav-icon">🌐</span>
          <span>Connections</span>
        </a>

        <div class="nav-group-title">MONITORING</div>
        <a class="nav-item" onclick="switchNav('analytics')">
          <span class="nav-icon">📈</span>
          <span>Analytics</span>
        </a>
        <a class="nav-item" onclick="switchNav('logs')">
          <span class="nav-icon">📜</span>
          <span>Logs</span>
        </a>

        <div class="nav-group-title">CONFIGURATION</div>
        <a class="nav-item" onclick="switchNav('routing-rules')">
          <span class="nav-icon">⚙️</span>
          <span>Routing Rules</span>
        </a>
        <a class="nav-item" onclick="switchNav('configuration')">
          <span class="nav-icon">🏢</span>
          <span>System Config</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="system-status-indicator">
          <span class="dot dot-success" id="sidebar-status-dot"></span>
          <span id="sidebar-status-text">Router Online</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="triggerTestOrder()" title="Bắn 1 đơn mẫu vào Router để thử nghiệm">
          ⚡ Bắn đơn
        </button>
      </div>
    </aside>

    <!-- ── MAIN WRAPPER ─────────────────────────────────────────────── -->
    <div class="main-wrapper">

      <!-- TOPBAR -->
      <header class="topbar">
        <div class="topbar-left">
          <div class="topbar-title" id="page-title">Operations Dashboard</div>

          <!-- Environment Target Pill -->
          <div class="env-badge-group">
            <button class="env-toggle-btn active env-test" id="topbar-env-test" onclick="switchOdooTarget('odoo_test')">
              TEST
            </button>
            <button class="env-toggle-btn env-prod" id="topbar-env-prod" onclick="switchOdooTarget('odoo_prod')">
              PROD
            </button>
          </div>
        </div>

        <div class="topbar-center">
          <div class="health-pill healthy" id="pill-router">
            <span class="dot dot-success"></span> Router: Online
          </div>
          <div class="health-pill healthy" id="pill-redis">
            <span class="dot dot-success"></span> Redis: Connected
          </div>
          <div class="health-pill healthy" id="pill-odoo">
            <span class="dot dot-success"></span> Odoo: Connected
          </div>
          <div class="health-pill healthy" id="pill-ocms">
            <span class="dot dot-success"></span> OCMS: Connected
          </div>
        </div>

        <div class="topbar-right">
          <span class="last-update-text">Cập nhật: <strong id="last-update-time">--:--:--</strong></span>

          <label class="auto-refresh-toggle" title="Tự động làm mới mỗi 10 giây">
            <input type="checkbox" id="chk-auto-refresh" checked onchange="toggleAutoRefresh(this.checked)">
            <span>Auto (10s)</span>
          </label>

          <button class="btn btn-secondary btn-sm" onclick="refreshAll(true)" id="btn-manual-refresh">
            🔄 Làm mới
          </button>
        </div>
      </header>

      <!-- MAIN CONTENT -->
      <main class="main-content">

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 1: DASHBOARD (MAIN OPERATIONS CONTROL CENTER)          -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel active" id="panel-dashboard">

          <!-- EXECUTIVE KPI GRID -->
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: var(--primary);"></div>
              <div class="kpi-label">Orders Today</div>
              <div class="kpi-value" id="kpi-orders-today">0</div>
              <div class="kpi-sub">Tổng đơn trong ngày</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: var(--success);"></div>
              <div class="kpi-label">Successful</div>
              <div class="kpi-value" style="color: var(--success);" id="kpi-successful">0</div>
              <div class="kpi-sub">Đồng bộ hoàn tất</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: var(--primary);"></div>
              <div class="kpi-label">Processing</div>
              <div class="kpi-value" style="color: var(--primary);" id="kpi-processing">0</div>
              <div class="kpi-sub">Đang trong hàng đợi</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: var(--warning);"></div>
              <div class="kpi-label">Retrying</div>
              <div class="kpi-value" style="color: var(--warning);" id="kpi-retrying">0</div>
              <div class="kpi-sub">Đang thử lại</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: var(--danger);"></div>
              <div class="kpi-label">Failed</div>
              <div class="kpi-value" style="color: var(--danger);" id="kpi-failed">0</div>
              <div class="kpi-sub">Đơn cần xử lý</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: #8B5CF6;"></div>
              <div class="kpi-label">Success Rate</div>
              <div class="kpi-value" style="color: #7C3AED;" id="kpi-success-rate">100%</div>
              <div class="kpi-sub">Tỷ lệ thành công</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-indicator" style="background-color: #06B6D4;"></div>
              <div class="kpi-label">Avg Processing</div>
              <div class="kpi-value" style="color: #0891B2;" id="kpi-avg-time">1.2s</div>
              <div class="kpi-sub">Thời gian xử lý TB</div>
            </div>
          </div>

          <!-- ROW 2: THROUGHPUT CHART + SYSTEM HEALTH -->
          <div class="grid-2">
            <div class="card" style="margin-bottom:0;">
              <div class="card-header">
                <div>
                  <div class="card-title">📈 Orders Throughput (Theo Giờ Trong Ngày)</div>
                  <div class="card-subtitle">Số lượng đơn hàng tiếp nhận, hoàn thành và lỗi theo các khung giờ</div>
                </div>
                <div>
                  <span class="badge badge-primary">24 Giờ</span>
                </div>
              </div>
              <div style="height: 230px; position: relative;">
                <canvas id="chart-throughput"></canvas>
              </div>
            </div>

            <div class="card" style="margin-bottom:0;">
              <div class="card-header">
                <div>
                  <div class="card-title">🌐 Trạng Thái Kết Nối (Connection Health)</div>
                  <div class="card-subtitle">Độ trễ và tình trạng thực tế của các dịch vụ lõi</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="pingAllSystems()">Ping Tất Cả</button>
              </div>

              <div class="table-container" style="border:none;">
                <table>
                  <thead>
                    <tr>
                      <th>Dịch vụ</th>
                      <th>Trạng thái</th>
                      <th>Độ trễ</th>
                      <th style="text-align:right;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="quick-health-body">
                    <tr><td colspan="4" style="text-align:center; padding:18px;">Đang kiểm tra kết nối...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- ROW 3: ROUTER FLOW VISUALIZER -->
          <div class="card" style="margin-top:20px;">
            <div class="card-header">
              <div>
                <div class="card-title">🔀 Universal Router Realtime Flow Map</div>
                <div class="card-subtitle">Trực quan hóa luồng dữ liệu sự kiện thời gian thực kèm số liệu thực tế tại mỗi điểm chạm</div>
              </div>
              <span class="version-badge">DECISION ENGINE ACTIVE</span>
            </div>

            <div class="flow-canvas">
              <!-- Node 1: Web Store -->
              <div class="flow-node">
                <div class="flow-node-header">
                  <span class="flow-node-title">🛒 Web Store LaPet</span>
                  <span class="dot dot-success" id="flow-dot-store"></span>
                </div>
                <div class="flow-stat-row">
                  <span>Nguồn:</span>
                  <span class="flow-stat-val">E-Commerce</span>
                </div>
                <div class="flow-stat-row">
                  <span>Latency:</span>
                  <span class="flow-stat-val" id="flow-store-latency">45ms</span>
                </div>
              </div>

              <div class="flow-arrow">➔</div>

              <!-- Node 2: Universal Router -->
              <div class="flow-node" style="border-color: var(--primary);">
                <div class="flow-node-header">
                  <span class="flow-node-title" style="color: var(--primary);">⚡ Universal Router</span>
                  <span class="dot dot-success"></span>
                </div>
                <div class="flow-stat-row">
                  <span>Cổng lắng nghe:</span>
                  <span class="flow-stat-val">Port 3001</span>
                </div>
                <div class="flow-stat-row">
                  <span>Thẩm định:</span>
                  <span class="flow-stat-val">Zod Schema OK</span>
                </div>
              </div>

              <div class="flow-arrow">➔</div>

              <!-- Node 3: Redis / BullMQ -->
              <div class="flow-node">
                <div class="flow-node-header">
                  <span class="flow-node-title">📦 Redis / BullMQ</span>
                  <span class="dot dot-success" id="flow-dot-redis"></span>
                </div>
                <div class="flow-stat-row">
                  <span>Hàng đợi:</span>
                  <span class="flow-stat-val" id="flow-redis-queues">2 Queues</span>
                </div>
                <div class="flow-stat-row">
                  <span>Chờ xử lý:</span>
                  <span class="flow-stat-val" id="flow-redis-waiting">0 jobs</span>
                </div>
              </div>

              <div class="flow-arrow">➔</div>

              <!-- Node 4: Odoo ERP Target -->
              <div class="flow-node" style="border-left: 3px solid #F59E0B;">
                <div class="flow-node-header">
                  <span class="flow-node-title">🏢 Odoo ERP Target</span>
                  <span class="dot dot-success" id="flow-dot-odoo"></span>
                </div>
                <div class="flow-stat-row">
                  <span>Đích đến:</span>
                  <span class="flow-stat-val" id="flow-odoo-target">Odoo Test</span>
                </div>
                <div class="flow-stat-row">
                  <span>Sale Orders:</span>
                  <span class="flow-stat-val" id="flow-odoo-count">--</span>
                </div>
              </div>

              <div class="flow-arrow">➔</div>

              <!-- Node 5: OCMS & Zalo -->
              <div class="flow-node" style="border-left: 3px solid #10B981;">
                <div class="flow-node-header">
                  <span class="flow-node-title">💬 OCMS Core & Zalo</span>
                  <span class="dot dot-success" id="flow-dot-ocms"></span>
                </div>
                <div class="flow-stat-row">
                  <span>CRM Sync:</span>
                  <span class="flow-stat-val" id="flow-ocms-count">--</span>
                </div>
                <div class="flow-stat-row">
                  <span>Thông báo:</span>
                  <span class="flow-stat-val">Zalo OA + PDF</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ROW 4: RECENT ORDERS TABLE + QUEUES & WORKERS -->
          <div class="grid-2">
            <!-- Left: Recent Orders Table -->
            <div class="card" style="margin-bottom:0;">
              <div class="card-header">
                <div>
                  <div class="card-title">📦 Đơn Hàng Vừa Xử Lý (Recent Orders)</div>
                  <div class="card-subtitle">Nhấn vào hàng để xem chi tiết Timeline & thông tin đơn</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="switchNav('orders')">Xem Tất Cả ➔</button>
              </div>

              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Mã đơn</th>
                      <th>Khách hàng</th>
                      <th>Số tiền</th>
                      <th>Odoo SO</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody id="dashboard-orders-body">
                    <tr><td colspan="6" style="text-align:center; padding:18px;">Đang tải danh sách đơn hàng...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Right: Queues & Workers Status -->
            <div class="card" style="margin-bottom:0;">
              <div class="card-header">
                <div>
                  <div class="card-title">⚡ Hàng Đợi & Workers (BullMQ)</div>
                  <div class="card-subtitle">Tải công việc realtime của 2 trụ cột Odoo ERP & OCMS</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="loadQueueMetrics()">Làm mới</button>
              </div>

              <div class="queue-grid" id="dashboard-queues-container">
                <!-- Loaded dynamically -->
              </div>

              <!-- Dead Letter Queue Alert Card -->
              <div id="dlq-alert-banner" style="margin-top:16px;">
                <!-- Loaded dynamically -->
              </div>
            </div>
          </div>

          <!-- ROW 5: ACTIVITY TIMELINE -->
          <div class="card" style="margin-top:20px;">
            <div class="card-header">
              <div>
                <div class="card-title">📜 Nhật Ký Vận Hành Gần Nhất (Recent Activity)</div>
                <div class="card-subtitle">Ghi nhận các mốc xử lý đơn hàng, điều phối sự kiện và kết nối dịch vụ</div>
              </div>
              <div class="filter-group">
                <button class="btn btn-secondary btn-sm active" onclick="filterActivity('ALL', this)">ALL</button>
                <button class="btn btn-secondary btn-sm" onclick="filterActivity('ORDERS', this)">ORDERS</button>
                <button class="btn btn-secondary btn-sm" onclick="filterActivity('ODOO', this)">ODOO</button>
                <button class="btn btn-secondary btn-sm" onclick="filterActivity('OCMS', this)">OCMS</button>
                <button class="btn btn-secondary btn-sm" onclick="filterActivity('ERRORS', this)">ERRORS</button>
              </div>
            </div>

            <div class="timeline" id="recent-activity-timeline">
              <!-- Loaded dynamically -->
            </div>
          </div>

        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 2: ĐƠN HÀNG (FULL ORDERS TABLE)                        -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-orders">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">📦 Quản Lý Đơn Hàng Qua Router (Orders Directory)</div>
                <div class="card-subtitle">Dữ liệu đơn hàng thực tế từ Web Store LaPet và Zalo Chat được Router phân phối</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-danger btn-sm" onclick="confirmResetQueues()">🗑️ Reset Lịch Sử Đơn</button>
                <button class="btn btn-primary btn-sm" onclick="triggerTestOrder()">+ Bắn Đơn Mẫu</button>
              </div>
            </div>

            <!-- Toolbar filters -->
            <div class="toolbar">
              <div class="filter-group">
                <input type="text" class="search-input" id="order-search-input" placeholder="🔍 Tìm mã đơn, tên khách, SĐT..." oninput="debounceOrderSearch()">
                <select class="select-input" id="order-filter-status" onchange="loadOrdersTable(1)">
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="SUCCESS">Thành công (SUCCESS)</option>
                  <option value="PROCESSING">Đang xử lý (PROCESSING)</option>
                  <option value="RETRYING">Đang thử lại (RETRYING)</option>
                  <option value="FAILED">Thất bại (FAILED)</option>
                </select>
                <select class="select-input" id="order-filter-source" onchange="loadOrdersTable(1)">
                  <option value="ALL">Tất cả nguồn</option>
                  <option value="store_lapet">Web Store LaPet</option>
                  <option value="zalo_chat">Zalo Chat OCMS</option>
                </select>
              </div>
              <div id="orders-pagination-info" style="font-size:12px; color:var(--text-muted);">
                Đang tải...
              </div>
            </div>

            <!-- Full Orders Table -->
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Mã đơn hàng</th>
                    <th>Khách hàng</th>
                    <th>Số tiền</th>
                    <th>Nguồn</th>
                    <th>Odoo SO</th>
                    <th>OCMS & Zalo</th>
                    <th>Thanh toán</th>
                    <th>Thời gian xử lý</th>
                    <th>Trạng thái</th>
                    <th style="text-align:right;">Chi tiết</th>
                  </tr>
                </thead>
                <tbody id="full-orders-body">
                  <tr><td colspan="11" style="text-align:center; padding:24px;">Đang đọc dữ liệu đơn hàng...</td></tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination buttons -->
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
              <button class="btn btn-secondary btn-sm" id="btn-prev-page" onclick="changeOrdersPage(-1)" disabled>◀ Trang trước</button>
              <button class="btn btn-secondary btn-sm" id="btn-next-page" onclick="changeOrdersPage(1)" disabled>Trang sau ▶</button>
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 3: EVENT FLOW (FULL ARCHITECTURE)                      -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-flow">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">🔀 Universal Router Event Distribution Architecture</div>
                <div class="card-subtitle">Sơ đồ chi tiết cách các sự kiện di chuyển qua Microservice Router, BullMQ và các hệ thống vệ tinh</div>
              </div>
            </div>

            <div style="padding: 20px; background: #FAFAFC; border: 1px solid var(--border-color); border-radius: var(--radius);">
              <div class="flow-canvas" style="border:none; padding:10px 0; background:none;">
                <div class="flow-node">
                  <div class="flow-node-header">
                    <span class="flow-node-title">🛒 Web Store LaPet</span>
                    <span class="dot dot-success"></span>
                  </div>
                  <div class="flow-stat-row"><span>Sự kiện phát sinh:</span><span class="flow-stat-val">order.created</span></div>
                  <div class="flow-stat-row"><span>Payload:</span><span class="flow-stat-val">JSON chuẩn Zod</span></div>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-node" style="border-color:var(--primary);">
                  <div class="flow-node-header">
                    <span class="flow-node-title" style="color:var(--primary);">⚡ Universal Router</span>
                    <span class="dot dot-success"></span>
                  </div>
                  <div class="flow-stat-row"><span>Cơ chế:</span><span class="flow-stat-val">Event Dispatcher</span></div>
                  <div class="flow-stat-row"><span>Phản hồi Web:</span><span class="flow-stat-val">&lt; 30ms</span></div>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-node">
                  <div class="flow-node-header">
                    <span class="flow-node-title">📦 BullMQ (queue_odoo)</span>
                    <span class="dot dot-success"></span>
                  </div>
                  <div class="flow-stat-row"><span>Attempts:</span><span class="flow-stat-val">3 lần (Backoff)</span></div>
                  <div class="flow-stat-row"><span>Action:</span><span class="flow-stat-val">create_sale_order</span></div>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-node">
                  <div class="flow-node-header">
                    <span class="flow-node-title">🏢 Odoo ERP Target</span>
                    <span class="dot dot-success"></span>
                  </div>
                  <div class="flow-stat-row"><span>Giao thức:</span><span class="flow-stat-val">XML-RPC / JSON-RPC</span></div>
                  <div class="flow-stat-row"><span>Kết quả:</span><span class="flow-stat-val">Báo giá sale.order</span></div>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-node">
                  <div class="flow-node-header">
                    <span class="flow-node-title">💬 OCMS (CRM & Zalo)</span>
                    <span class="dot dot-success"></span>
                  </div>
                  <div class="flow-stat-row"><span>Queue:</span><span class="flow-stat-val">queue_ocms</span></div>
                  <div class="flow-stat-row"><span>Đầu ra:</span><span class="flow-stat-val">Zalo OA + Hóa đơn</span></div>
                </div>
              </div>
            </div>

            <!-- Flow Rules Table summary -->
            <div style="margin-top:24px;">
              <div class="card-title" style="margin-bottom:12px;">Bảng Sự Kiện Đã Đăng Ký</div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Mã Sự Kiện</th>
                      <th>Tên Sự Kiện</th>
                      <th>Hàng Đợi</th>
                      <th>Hành Động Đích</th>
                      <th>Cơ chế thử lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><span class="code-tag">order.created</span></td>
                      <td>Đơn hàng mới từ Web Store</td>
                      <td><span class="code-tag" style="color:var(--primary);">queue_odoo</span></td>
                      <td><code>create_sale_order</code> (Odoo ERP)</td>
                      <td>3 lần (exponential backoff)</td>
                    </tr>
                    <tr>
                      <td><span class="code-tag">order.odoo_synced</span></td>
                      <td>Đã tạo xong báo giá Odoo</td>
                      <td><span class="code-tag" style="color:#059669;">queue_ocms</span></td>
                      <td><code>process_order_and_notify</code> (OCMS CRM & Zalo)</td>
                      <td>3 lần (exponential backoff)</td>
                    </tr>
                    <tr>
                      <td><span class="code-tag">payment.success</span></td>
                      <td>Thanh toán chuyển khoản thành công</td>
                      <td><span class="code-tag">queue_odoo / queue_ocms</span></td>
                      <td><code>confirm_payment</code> (Ghi nhận hóa đơn)</td>
                      <td>3 lần</td>
                    </tr>
                    <tr>
                      <td><span class="code-tag">order.cancelled</span></td>
                      <td>Hủy đơn hàng</td>
                      <td><span class="code-tag" style="color:var(--primary);">queue_odoo</span></td>
                      <td><code>cancel_sale_order</code> (Odoo ERP)</td>
                      <td>3 lần</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 4: QUEUE & WORKER                                      -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-queues">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">⚡ Giám Sát Chi Tiết Hàng Đợi & Workers (BullMQ Redis)</div>
                <div class="card-subtitle">Theo dõi trạng thái từng worker, dung lượng backlog và độ trễ xử lý</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-danger btn-sm" onclick="confirmResetQueues()">🗑️ Reset Toàn Bộ Queue</button>
                <button class="btn btn-secondary btn-sm" onclick="loadQueueMetrics()">🔄 Quét Hàng Đợi</button>
              </div>
            </div>

            <div class="queue-grid" id="full-queues-container">
              <!-- Loaded dynamically -->
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 5: DEAD LETTER QUEUE (DLQ)                             -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-dlq">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">🚨 Hàng Đợi Đơn Lỗi & Thử Lại (Dead Letter Queue)</div>
                <div class="card-subtitle">Các đơn hàng xử lý thất bại sau khi đã vượt quá số lần thử lại tối đa</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="loadDlqTable()">🔄 Quét Đơn Lỗi</button>
            </div>

            <div id="dlq-table-container">
              <!-- Loaded dynamically -->
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 6: CONNECTIONS & HEALTH                                -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-connections">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">🌐 Danh Bạ Hệ Thống & Kiểm Tra Kết Nối (System Directory)</div>
                <div class="card-subtitle">Danh mục các hệ thống kết nối trong hệ sinh thái OCMS</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="openAddSystemModal()">+ Thêm Hệ Thống</button>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Hệ Thống</th>
                    <th>Mã ID</th>
                    <th>Loại hình</th>
                    <th>Địa chỉ URL</th>
                    <th>Độ trễ Ping</th>
                    <th style="text-align:right;">Thao tác</th>
                  </tr>
                </thead>
                <tbody id="full-systems-body">
                  <!-- Loaded dynamically -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- Odoo JSON-RPC Connection Diagnostic Tool -->
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">🔍 Chẩn Đoán Xác Thực Trực Tiếp Odoo ERP (JSON-RPC)</div>
                <div class="card-subtitle">Gửi yêu cầu xác thực trực tiếp tài khoản & API Key tới máy chủ Odoo</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="runOdooRpcDiagnostic()">🚀 Bắt Đầu Kiểm Tra</button>
            </div>
            <div id="odoo-rpc-diagnostic-result" style="display:none; padding:14px; border-radius:var(--radius-sm); font-size:12px;"></div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 7: ANALYTICS                                           -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-analytics">
          <div class="grid-equal">
            <div class="card">
              <div class="card-header">
                <div class="card-title">📊 Phân Bổ Trạng Thái Đơn Hàng</div>
                <div class="card-subtitle">Tỷ lệ đơn thành công, đang xử lý và lỗi</div>
              </div>
              <div style="height: 260px; position: relative;">
                <canvas id="chart-status-donut"></canvas>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">⏱️ Phân Phối Thời Gian Xử Lý (Latency Distribution)</div>
                <div class="card-subtitle">Thời gian trung bình hoàn tất luồng qua Router</div>
              </div>
              <div style="height: 260px; position: relative;">
                <canvas id="chart-latency-bar"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 8: LOG VIEWER                                          -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-logs">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">📜 Nhật Ký Hoạt Động Hệ Thống (Realtime Log Viewer)</div>
                <div class="card-subtitle">Toàn bộ thông điệp xử lý, cảnh báo và lỗi phát sinh trong Router</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="loadLogsTable(0)">🔄 Tải Lại Logs</button>
            </div>

            <!-- Toolbar filters -->
            <div class="toolbar">
              <div class="filter-group">
                <input type="text" class="search-input" id="log-search-input" placeholder="🔍 Tìm kiếm trong log..." oninput="debounceLogSearch()">
                <select class="select-input" id="log-filter-level" onchange="loadLogsTable(0)">
                  <option value="ALL">Tất cả mức độ (Level)</option>
                  <option value="INFO">INFO</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
                <select class="select-input" id="log-filter-service" onchange="loadLogsTable(0)">
                  <option value="ALL">Tất cả dịch vụ (Service)</option>
                  <option value="ROUTER">ROUTER</option>
                  <option value="ODOO">ODOO</option>
                  <option value="OCMS">OCMS</option>
                  <option value="REDIS">REDIS</option>
                </select>
              </div>
              <div id="logs-pagination-info" style="font-size:12px; color:var(--text-muted);">
                Đang tải...
              </div>
            </div>

            <!-- Logs Table -->
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Mức độ</th>
                    <th>Dịch vụ</th>
                    <th>Hàng đợi</th>
                    <th>Sự kiện / Mã đơn</th>
                    <th>Nội dung thông điệp</th>
                  </tr>
                </thead>
                <tbody id="logs-table-body">
                  <tr><td colspan="6" style="text-align:center; padding:24px;">Đang tải logs...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 9: ROUTING RULES                                       -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-routing-rules">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">⚙️ Bảng Định Tuyến Sự Kiện (Event Dispatch Rules)</div>
                <div class="card-subtitle">Bật / tắt các điểm đích nhận dữ liệu khi phát sinh sự kiện từ Web Store hoặc OCMS</div>
              </div>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Sự kiện nguồn</th>
                    <th>Điểm đích nhận</th>
                    <th>Hàng đợi</th>
                    <th>Hành động thực thi</th>
                    <th>Thử lại</th>
                    <th style="text-align:right;">Kích hoạt</th>
                  </tr>
                </thead>
                <tbody id="routing-rules-body">
                  <!-- Loaded dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!-- TAB 10: SYSTEM CONFIGURATION                               -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="tab-panel" id="panel-configuration">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">🏢 Cấu Hình Máy Chủ Odoo ERP (Router Decision Target)</div>
                <div class="card-subtitle">Chuyển đổi và thiết lập thông số kết nối Odoo Test hoặc Odoo Chính Thức</div>
              </div>
              <div class="env-badge-group">
                <button class="env-toggle-btn active" id="cfg-tab-test" onclick="selectConfigEnv('odoo_test')">🧪 Môi Trường Test</button>
                <button class="env-toggle-btn" id="cfg-tab-prod" onclick="selectConfigEnv('odoo_prod')">🏢 Môi Trường Chính Thức</button>
              </div>
            </div>

            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; margin-bottom:16px;" id="cfg-form-row">
              <div class="form-group">
                <label class="form-label">Địa chỉ máy chủ Odoo (URL) *</label>
                <input type="url" id="cfg-url" class="form-input" placeholder="https://test-odoo.fonti.vn">
              </div>
              <div class="form-group">
                <label class="form-label">Tên Database Odoo *</label>
                <input type="text" id="cfg-db" class="form-input" placeholder="odoo">
              </div>
              <div class="form-group">
                <label class="form-label">Tài khoản kết nối *</label>
                <input type="text" id="cfg-user" class="form-input" placeholder="sale.order01@gmai.com">
              </div>
              <div class="form-group">
                <label class="form-label">API Key / Token *</label>
                <input type="password" id="cfg-apikey" class="form-input" placeholder="Khóa bí mật">
              </div>
            </div>

            <div id="cfg-alert" style="display:none; padding:10px 14px; border-radius:var(--radius-sm); margin-bottom:14px; font-size:12px;"></div>

            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:14px; border-top:1px solid var(--border-color);">
              <div id="cfg-active-status" style="font-size:12px; color:var(--text-muted);">
                <!-- Dynamic active target indicator -->
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" onclick="testCurrentOdooConnection()">🔄 Kiểm tra kết nối</button>
                <button class="btn btn-primary" onclick="saveCurrentOdooConfig()">💾 Lưu Cấu Hình</button>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  </div>

  <!-- ── ORDER DETAIL DRAWER ────────────────────────────────────────── -->
  <div class="drawer-overlay" id="order-drawer" onclick="closeOrderDrawer(event)">
    <div class="drawer" onclick="event.stopPropagation()">
      <div class="drawer-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <h2 style="font-size:16px; font-weight:700;" id="drawer-order-code">#ORDER_CODE</h2>
            <span class="status-badge" id="drawer-status-badge">SUCCESS</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;" id="drawer-order-time">--</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="closeOrderDrawer()">✕ Đóng</button>
      </div>

      <div class="drawer-body">
        <!-- Customer Details Box -->
        <div style="background:#F9FAFB; border:1px solid var(--border-color); border-radius:var(--radius); padding:14px; margin-bottom:18px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px;">👤 Thông Tin Khách Hàng</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
            <div><span style="color:var(--text-muted);">Họ và tên:</span> <strong id="drawer-customer-name">--</strong></div>
            <div><span style="color:var(--text-muted);">Số điện thoại:</span> <strong id="drawer-customer-phone">--</strong></div>
            <div style="grid-column: span 2;"><span style="color:var(--text-muted);">Địa chỉ nhận:</span> <span id="drawer-customer-addr">--</span></div>
            <div><span style="color:var(--text-muted);">Nguồn đơn:</span> <span class="code-tag" id="drawer-source">--</span></div>
            <div><span style="color:var(--text-muted);">Thanh toán:</span> <span id="drawer-payment">COD</span></div>
          </div>
        </div>

        <!-- Items Table -->
        <div style="margin-bottom:20px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px;">🛒 Sản Phẩm Trong Đơn</div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>SKU</th>
                  <th>SL</th>
                  <th style="text-align:right;">Đơn giá</th>
                  <th style="text-align:right;">Thành tiền</th>
                </tr>
              </thead>
              <tbody id="drawer-items-body">
                <tr><td colspan="5" style="text-align:center;">Không có sản phẩm</td></tr>
              </tbody>
            </table>
          </div>
          <div style="text-align:right; font-size:14px; font-weight:700; margin-top:8px;">
            Tổng tiền: <span style="color:var(--primary);" id="drawer-total-amount">0 ₫</span>
          </div>
        </div>

        <!-- Lifecycle Timeline -->
        <div>
          <div style="font-weight:700; font-size:13px; margin-bottom:12px;">⏱️ Tiến Trình Xử Lý Thực Tế (Lifecycle Flow)</div>
          <div class="timeline" id="drawer-timeline">
            <!-- Loaded dynamically -->
          </div>
        </div>
      </div>

      <div class="drawer-footer">
        <button class="btn btn-secondary btn-sm" onclick="closeOrderDrawer()">Đóng</button>
        <button class="btn btn-primary btn-sm" id="drawer-retry-btn" style="display:none;" onclick="retryDrawerOrder()">⚡ Thử Lại Đơn Này</button>
      </div>
    </div>
  </div>

  <!-- ── MODAL: THÊM HỆ THỐNG MỚI ───────────────────────────────────── -->
  <div class="modal-overlay" id="add-system-modal">
    <div class="modal">
      <div class="modal-header">
        <span>Thêm Hệ Thống Vào Danh Bạ Kết Nối</span>
        <button class="btn btn-secondary btn-sm" onclick="closeAddSystemModal()">✕</button>
      </div>
      <form onsubmit="handleAddSystem(event)">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Mã định danh (ID, vd: tiktok_shop, crm_branch_2) *</label>
            <input type="text" id="sys-id" class="form-input" required placeholder="vd: shopee_store">
          </div>
          <div class="form-group">
            <label class="form-label">Tên hiển thị *</label>
            <input type="text" id="sys-name" class="form-input" required placeholder="vd: Cửa Hàng Shopee Mall">
          </div>
          <div class="form-group">
            <label class="form-label">Loại hình hệ thống *</label>
            <select id="sys-type" class="form-input">
              <option value="ecommerce">Sàn Thương Mại Điện Tử (E-commerce)</option>
              <option value="pos">Phần Mềm Bán Lẻ (POS)</option>
              <option value="crm">Hệ Thống CRM / Khách Hàng</option>
              <option value="webhook">Dịch Vụ Webhook Thứ Ba</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Địa chỉ kết nối (Endpoint URL) *</label>
            <input type="url" id="sys-url" class="form-input" required placeholder="https://api.example.com">
          </div>
          <div class="form-group">
            <label class="form-label">Mô tả hệ thống</label>
            <input type="text" id="sys-desc" class="form-input" placeholder="Tích hợp tiếp nhận đơn hàng tự động">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeAddSystemModal()">Hủy</button>
          <button type="submit" class="btn btn-primary">Lưu Vào Danh Bạ</button>
        </div>
      </form>
    </div>
  </div>

  <div id="toast">Thông báo</div>

  <!-- ── FRONTEND JAVASCRIPT LOGIC ──────────────────────────────────── -->
  <script>
    // State management
    const state = {
      activeNav: 'dashboard',
      activeEnv: 'odoo_test',
      kpi: null,
      orders: [],
      ordersPage: 1,
      ordersTotal: 0,
      ordersLimit: 20,
      selectedOrderCode: null,
      queues: {},
      workers: {},
      systems: {},
      rules: {},
      logs: [],
      activities: [],
      autoRefresh: true,
      refreshIntervalId: null,
      throughputChart: null,
      statusDonutChart: null,
      latencyBarChart: null,
    };

    function formatVND(amount) {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2800);
    }

    // Switch Navigation Tab
    function switchNav(navKey) {
      state.activeNav = navKey;
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('onclick')?.includes(navKey));
      });
      document.querySelectorAll('.tab-panel').forEach(el => {
        el.classList.toggle('active', el.id === \`panel-\${navKey}\`);
      });

      const titles = {
        'dashboard': 'Operations Dashboard / Control Center',
        'orders': 'Danh Sách Đơn Hàng Qua Router',
        'flow': 'Sơ Đồ Phân Phối Sự Kiện (Event Flow)',
        'queues': 'Giám Sát Hàng Đợi & Workers (BullMQ)',
        'dlq': 'Hàng Đợi Đơn Lỗi (Dead Letter Queue)',
        'connections': 'Danh Bạ Kết Nối & Health Check',
        'analytics': 'Phân Tích & Chỉ Số Vận Hành (Analytics)',
        'logs': 'Nhật Ký Hệ Thống (Log Viewer)',
        'routing-rules': 'Bảng Định Tuyến Sự Kiện (Routing Rules)',
        'configuration': 'Cấu Hình Hệ Thống & Odoo ERP',
      };
      document.getElementById('page-title').innerText = titles[navKey] || 'Operations Dashboard';

      if (navKey === 'orders') loadOrdersTable(1);
      if (navKey === 'dlq') loadDlqTable();
      if (navKey === 'logs') loadLogsTable(0);
      if (navKey === 'analytics') renderAnalyticsCharts();
    }

    // Auto refresh toggle
    function toggleAutoRefresh(enabled) {
      state.autoRefresh = enabled;
      if (enabled) {
        startAutoRefresh();
        showToast('Đã BẬT tự động làm mới (10s)');
      } else {
        if (state.refreshIntervalId) clearInterval(state.refreshIntervalId);
        showToast('Đã TẮT tự động làm mới');
      }
    }

    function startAutoRefresh() {
      if (state.refreshIntervalId) clearInterval(state.refreshIntervalId);
      state.refreshIntervalId = setInterval(() => {
        if (state.autoRefresh) refreshAll(false);
      }, 10000);
    }

    // Core Data Fetcher
    async function refreshAll(manual = false) {
      if (manual) {
        const btn = document.getElementById('btn-manual-refresh');
        if (btn) btn.innerText = '⏳ Đang tải...';
      }

      try {
        await Promise.allSettled([
          fetchKpiAndOrders(),
          loadQueueMetrics(),
          loadWorkersStatus(),
          loadSystemsDirectory(),
          loadRoutingRules(),
          loadActivityTimeline(),
        ]);
        document.getElementById('last-update-time').innerText = new Date().toLocaleTimeString('vi-VN');
      } catch (err) {
        console.error('Lỗi làm mới:', err);
      } finally {
        if (manual) {
          const btn = document.getElementById('btn-manual-refresh');
          if (btn) btn.innerText = '🔄 Làm mới';
          showToast('Đã cập nhật dữ liệu mới nhất');
        }
      }
    }

    // 1. Fetch Orders and KPI
    async function fetchKpiAndOrders() {
      try {
        const res = await fetch(\`/api/v1/orders?limit=10&page=1\`);
        const json = await res.json();
        if (!json.success) return;

        state.kpi = json.kpi;
        updateKpiDisplay(json.kpi);
        renderThroughputChart(json.kpi.hourly_distribution);
        renderDashboardOrdersTable(json.orders);
      } catch (e) {
        console.warn('Lỗi đọc đơn hàng & KPI:', e);
      }
    }

    function updateKpiDisplay(kpi) {
      if (!kpi) return;
      document.getElementById('kpi-orders-today').innerText = kpi.orders_today ?? 0;
      document.getElementById('kpi-successful').innerText = kpi.successful ?? 0;
      document.getElementById('kpi-processing').innerText = kpi.processing ?? 0;
      document.getElementById('kpi-retrying').innerText = kpi.retrying ?? 0;
      document.getElementById('kpi-failed').innerText = kpi.failed ?? 0;
      document.getElementById('kpi-success-rate').innerText = kpi.success_rate || '100%';
      document.getElementById('kpi-avg-time').innerText = kpi.avg_processing_time_s || '1.2s';
    }

    function renderDashboardOrdersTable(orders) {
      const tbody = document.getElementById('dashboard-orders-body');
      if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">Chưa có đơn hàng nào hôm nay.</td></tr>';
        return;
      }

      let html = '';
      for (const o of orders.slice(0, 8)) {
        const timeStr = new Date(o.created_at).toLocaleTimeString('vi-VN');
        html += \`
          <tr class="clickable-row" onclick="openOrderDrawer('\${o.order_code}')">
            <td><span class="code-tag">\${timeStr}</span></td>
            <td><strong>\${o.order_code}</strong></td>
            <td>
              <div>\${o.customer_name}</div>
              <div style="font-size:11px; color:var(--text-dim);">\${o.customer_phone}</div>
            </td>
            <td><strong>\${formatVND(o.amount)}</strong></td>
            <td>\${o.odoo_order_id ? \`<span class="code-tag">#\${o.odoo_order_id}</span>\` : '<span style="color:var(--text-dim);">---</span>'}</td>
            <td><span class="status-badge status-\${o.status}">\${o.status}</span></td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    // 2. Throughput Chart (Chart.js)
    function renderThroughputChart(hourlyData) {
      const canvas = document.getElementById('chart-throughput');
      if (!canvas || !hourlyData) return;

      const labels = hourlyData.map(d => d.hour);
      const createdData = hourlyData.map(d => d.created);
      const completedData = hourlyData.map(d => d.completed);
      const failedData = hourlyData.map(d => d.failed);

      if (state.throughputChart) {
        state.throughputChart.data.labels = labels;
        state.throughputChart.data.datasets[0].data = createdData;
        state.throughputChart.data.datasets[1].data = completedData;
        state.throughputChart.data.datasets[2].data = failedData;
        state.throughputChart.update('none');
        return;
      }

      const ctx = canvas.getContext('2d');
      state.throughputChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Tiếp nhận',
              data: createdData,
              backgroundColor: '#93C5FD',
              borderRadius: 3,
            },
            {
              label: 'Thành công',
              data: completedData,
              backgroundColor: '#16A34A',
              borderRadius: 3,
            },
            {
              label: 'Lỗi',
              data: failedData,
              backgroundColor: '#DC2626',
              borderRadius: 3,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } }
          }
        }
      });
    }

    // 3. Queue & Worker Monitor
    async function loadQueueMetrics() {
      try {
        const res = await fetch('/api/v1/queues/stats');
        const json = await res.json();
        if (!json.success) return;

        state.queues = json.data;
        renderQueueCards(json.data);
        updateFlowMetrics(json.data);
        checkDlqAlert();
      } catch (e) {
        console.warn('Lỗi đọc metrics queue:', e);
      }
    }

    function renderQueueCards(queuesData) {
      const container1 = document.getElementById('dashboard-queues-container');
      const container2 = document.getElementById('full-queues-container');

      let html = '';
      for (const [qName, q] of Object.entries(queuesData)) {
        const hasBacklog = (q.waiting || 0) > 10;
        html += \`
          <div class="queue-card">
            <div class="queue-card-header">
              <div>
                <span class="queue-name">\${qName}</span>
                \${hasBacklog ? '<div style="font-size:10px; color:var(--warning); font-weight:600;">⚠ Cảnh báo backlog tăng</div>' : ''}
              </div>
              <span class="health-pill healthy" style="padding:2px 7px; font-size:10px;">
                <span class="dot dot-success"></span> Online
              </span>
            </div>
            <div class="queue-stats-row">
              <div class="queue-stat-item">
                <div class="queue-stat-val" style="color:var(--warning);">\${q.waiting ?? 0}</div>
                <div class="queue-stat-lbl">Chờ</div>
              </div>
              <div class="queue-stat-item">
                <div class="queue-stat-val" style="color:var(--primary);">\${q.active ?? 0}</div>
                <div class="queue-stat-lbl">Đang chạy</div>
              </div>
              <div class="queue-stat-item">
                <div class="queue-stat-val" style="color:var(--success);">\${q.completed ?? 0}</div>
                <div class="queue-stat-lbl">Xong</div>
              </div>
              <div class="queue-stat-item">
                <div class="queue-stat-val" style="color:var(--danger);">\${q.failed ?? 0}</div>
                <div class="queue-stat-lbl">Lỗi</div>
              </div>
            </div>
          </div>
        \`;
      }

      if (container1) container1.innerHTML = html;
      if (container2) container2.innerHTML = html;
    }

    function updateFlowMetrics(queuesData) {
      const odooCompleted = queuesData.queue_odoo?.completed || 0;
      const ocmsCompleted = queuesData.queue_ocms?.completed || 0;
      const totalWaiting = (queuesData.queue_odoo?.waiting || 0) + (queuesData.queue_ocms?.waiting || 0);

      const elWaiting = document.getElementById('flow-redis-waiting');
      if (elWaiting) elWaiting.innerText = \`\${totalWaiting} jobs\`;

      const elOdooCount = document.getElementById('flow-odoo-count');
      if (elOdooCount) elOdooCount.innerText = \`\${odooCompleted} orders\`;

      const elOcmsCount = document.getElementById('flow-ocms-count');
      if (elOcmsCount) elOcmsCount.innerText = \`\${ocmsCompleted} synced\`;
    }

    // 4. Dead Letter Queue Check & Alert
    async function checkDlqAlert() {
      try {
        const res = await fetch('/api/v1/queues/failed');
        const json = await res.json();
        const count = json.count || 0;

        const badge = document.getElementById('nav-dlq-badge');
        if (badge) {
          badge.style.display = count > 0 ? 'inline-block' : 'none';
          badge.innerText = count;
        }

        const banner = document.getElementById('dlq-alert-banner');
        if (banner) {
          if (count === 0) {
            banner.innerHTML = \`
              <div style="padding:10px 14px; background-color:var(--success-subtle); border:1px solid var(--success-border); border-radius:var(--radius); display:flex; align-items:center; gap:8px; font-size:12px; color:var(--success);">
                <span>✓</span>
                <strong>Dead Letter Queue sạch sẽ:</strong> Không có đơn hàng nào bị lỗi sau khi thử lại.
              </div>
            \`;
          } else {
            banner.innerHTML = \`
              <div style="padding:10px 14px; background-color:var(--danger-subtle); border:1px solid var(--danger-border); border-radius:var(--radius); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--danger);">
                <div>
                  <strong>⚠ Phát hiện \${count} đơn hàng lỗi trong DLQ:</strong> Cần quản trị viên kiểm tra và thử lại.
                </div>
                <button class="btn btn-danger btn-sm" onclick="switchNav('dlq')">Xem DLQ ➔</button>
              </div>
            \`;
          }
        }
      } catch (e) {
        console.warn('Lỗi kiểm tra DLQ alert:', e);
      }
    }

    async function loadDlqTable() {
      const container = document.getElementById('dlq-table-container');
      try {
        const res = await fetch('/api/v1/queues/failed');
        const json = await res.json();
        const jobs = json.data || [];

        if (jobs.length === 0) {
          container.innerHTML = \`
            <div class="state-box">
              <div class="state-box-icon">🎉</div>
              <div class="state-box-title">Hàng đợi lỗi sạch sẽ (Dead Letter Queue Empty)</div>
              <div style="font-size:12px; color:var(--text-muted); max-width:400px; margin:0 auto;">
                Mọi đơn hàng đều đã được xử lý hoàn tất đồng bộ sang Odoo ERP và OCMS CRM thành công.
              </div>
            </div>
          \`;
          return;
        }

        let html = \`
          <div style="padding:10px 14px; background:var(--danger-subtle); border-bottom:1px solid var(--danger-border); color:var(--danger); font-size:12px; display:flex; justify-content:space-between; align-items:center;">
            <span>⚠️ Có <strong>\${jobs.length}</strong> đơn hàng lỗi cần xử lý. Hãy khắc phục nguyên nhân máy chủ trước khi kích hoạt Thử Lại.</span>
          </div>
          <div class="table-container" style="border:none;">
            <table>
              <thead>
                <tr>
                  <th>Job ID / Queue</th>
                  <th>Mã đơn</th>
                  <th>Nguyên nhân lỗi</th>
                  <th>Lần thử</th>
                  <th>Thời điểm</th>
                  <th style="text-align:right;">Thao tác</th>
                </tr>
              </thead>
              <tbody>
        \`;

        for (const j of jobs) {
          html += \`
            <tr>
              <td>
                <span class="code-tag">\${j.queue_name}</span>
                <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">#\${j.job_id}</div>
              </td>
              <td><strong>\${j.order_code || 'N/A'}</strong></td>
              <td style="color:var(--danger); font-size:11px; max-width:280px; word-break:break-word;">\${j.failed_reason}</td>
              <td><span class="code-tag">\${j.attempts_made}/\${j.max_attempts}</span></td>
              <td style="font-size:11px; color:var(--text-muted);">\${j.failed_at ? new Date(j.failed_at).toLocaleTimeString('vi-VN') : 'N/A'}</td>
              <td style="text-align:right;">
                <button class="btn btn-primary btn-sm" onclick="retryFailedJob('\${j.queue_name}', '\${j.job_id}')">⚡ Thử lại</button>
                <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteFailedJob('\${j.queue_name}', '\${j.job_id}')">🗑️ Xóa</button>
              </td>
            </tr>
          \`;
        }

        html += '</tbody></table></div>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="state-box"><div class="state-box-title">Lỗi kết nối tải dữ liệu DLQ</div></div>';
      }
    }

    async function retryFailedJob(queueName, jobId) {
      if (!confirm(\`Xác nhận kích hoạt 1-Click Retry cho Job #\${jobId} trên hàng đợi \${queueName}?\`)) return;
      try {
        const res = await fetch(\`/api/v1/queues/retry/\${queueName}/\${jobId}\`, { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          showToast(\`Đã kích hoạt thử lại Job #\${jobId}\`);
          loadDlqTable();
          loadQueueMetrics();
          fetchKpiAndOrders();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (e) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    async function deleteFailedJob(queueName, jobId) {
      if (!confirm(\`Bạn có chắc chắn muốn xóa vĩnh viễn Job #\${jobId} khỏi hàng đợi lỗi?\`)) return;
      try {
        const res = await fetch(\`/api/v1/queues/failed/\${queueName}/\${jobId}\`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
          showToast(\`Đã xóa Job #\${jobId}\`);
          loadDlqTable();
          loadQueueMetrics();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (e) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    // 5. Worker Status
    async function loadWorkersStatus() {
      try {
        const res = await fetch('/api/v1/workers/status');
        const json = await res.json();
        if (!json.success) return;

        state.workers = json.data;
        const odooRunning = json.data.odoo_worker?.running;
        const odooHealth = json.data.odoo_worker?.odoo_server_status?.healthy;

        const pillOdoo = document.getElementById('pill-odoo');
        if (pillOdoo) {
          if (odooRunning && odooHealth) {
            pillOdoo.className = 'health-pill healthy';
            pillOdoo.innerHTML = '<span class="dot dot-success"></span> Odoo: Connected';
          } else if (odooRunning && !odooHealth) {
            pillOdoo.className = 'health-pill error';
            pillOdoo.innerHTML = '<span class="dot dot-danger"></span> Odoo: Error';
          } else {
            pillOdoo.className = 'health-pill warning';
            pillOdoo.innerHTML = '<span class="dot dot-warning"></span> Odoo: Stopped';
          }
        }
      } catch (e) {
        console.warn('Lỗi kiểm tra worker status:', e);
      }
    }

    // 6. Systems Directory & Health Ping
    async function loadSystemsDirectory() {
      try {
        const res = await fetch('/api/v1/registry/systems');
        const json = await res.json();
        if (!json.success) return;

        state.systems = json.data;
        state.activeEnv = json.data.active_odoo_target || 'odoo_test';
        updateEnvButtons(state.activeEnv);
        renderQuickHealthTable(json.data.systems);
        renderFullSystemsTable(json.data.systems);
        populateConfigForm();
      } catch (e) {
        console.warn('Lỗi tải danh bạ hệ thống:', e);
      }
    }

    function updateEnvButtons(activeKey) {
      const isTest = activeKey === 'odoo_test';
      const btnTest = document.getElementById('topbar-env-test');
      const btnProd = document.getElementById('topbar-env-prod');
      if (btnTest && btnProd) {
        btnTest.classList.toggle('active', isTest);
        btnProd.classList.toggle('active', !isTest);
      }

      const flowTarget = document.getElementById('flow-odoo-target');
      if (flowTarget) {
        flowTarget.innerText = isTest ? 'Odoo Test' : 'Odoo Chính Thức';
      }
    }

    async function switchOdooTarget(targetKey) {
      try {
        const res = await fetch('/api/v1/registry/switch-odoo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: targetKey })
        });
        const json = await res.json();
        if (json.success) {
          showToast(json.message);
          state.activeEnv = targetKey;
          updateEnvButtons(targetKey);
          loadSystemsDirectory();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (e) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    function renderQuickHealthTable(systems) {
      const tbody = document.getElementById('quick-health-body');
      if (!tbody) return;

      let html = '';
      for (const [id, sys] of Object.entries(systems)) {
        html += \`
          <tr>
            <td>
              <div style="font-weight:600;">\${sys.name}</div>
              <div style="font-size:10px; color:var(--text-dim);">\${sys.url}</div>
            </td>
            <td><span class="health-pill healthy" style="font-size:10px; padding:2px 6px;">● Online</span></td>
            <td><span class="code-tag" id="ping-quick-\${id}">-- ms</span></td>
            <td style="text-align:right;">
              <button class="btn btn-secondary btn-sm" onclick="pingSingleSystem('\${id}')">Ping</button>
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    function renderFullSystemsTable(systems) {
      const tbody = document.getElementById('full-systems-body');
      if (!tbody) return;

      let html = '';
      for (const [id, sys] of Object.entries(systems)) {
        const isCore = ['ocms', 'store_lapet', 'odoo_test', 'odoo_prod'].includes(id);
        html += \`
          <tr>
            <td>
              <strong>\${sys.name}</strong>
              <div style="font-size:11px; color:var(--text-dim);">\${sys.description || ''}</div>
            </td>
            <td><span class="code-tag">\${id}</span></td>
            <td>\${sys.type}</td>
            <td><a href="\${sys.url}" target="_blank" style="color:var(--primary); font-family:'JetBrains Mono',monospace;">\${sys.url}</a></td>
            <td><span class="code-tag" id="ping-full-\${id}">Chưa kiểm tra</span></td>
            <td style="text-align:right;">
              <button class="btn btn-secondary btn-sm" onclick="pingSingleSystem('\${id}')">Ping</button>
              \${!isCore ? \`<button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteSystem('\${id}')">Xóa</button>\` : ''}
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    async function pingSingleSystem(sysId) {
      const label1 = document.getElementById(\`ping-quick-\${sysId}\`);
      const label2 = document.getElementById(\`ping-full-\${sysId}\`);
      if (label1) label1.innerText = '...';
      if (label2) label2.innerText = 'Đang ping...';

      try {
        const res = await fetch(\`/api/v1/registry/ping/\${sysId}\`);
        const json = await res.json();
        const text = json.reachable ? \`\${json.latency_ms}ms\` : 'Lỗi kết nối';
        const color = json.reachable ? 'var(--success)' : 'var(--danger)';

        if (label1) { label1.innerText = text; label1.style.color = color; }
        if (label2) { label2.innerText = text; label2.style.color = color; }
      } catch (e) {
        if (label1) label1.innerText = 'Lỗi';
        if (label2) label2.innerText = 'Lỗi';
      }
    }

    async function pingAllSystems() {
      if (!state.systems?.systems) return;
      for (const id of Object.keys(state.systems.systems)) {
        pingSingleSystem(id);
      }
      showToast('Đang ping kiểm tra toàn bộ các dịch vụ');
    }

    // 7. Full Orders Table & Search
    let searchDebounceTimer = null;
    function debounceOrderSearch() {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => loadOrdersTable(1), 300);
    }

    async function loadOrdersTable(page = 1) {
      state.ordersPage = page;
      const search = document.getElementById('order-search-input')?.value || '';
      const status = document.getElementById('order-filter-status')?.value || 'ALL';
      const source = document.getElementById('order-filter-source')?.value || 'ALL';

      const tbody = document.getElementById('full-orders-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:24px;">Đang tìm kiếm đơn hàng...</td></tr>';

      try {
        const res = await fetch(\`/api/v1/orders?search=\${encodeURIComponent(search)}&status=\${status}&source=\${source}&page=\${page}&limit=\${state.ordersLimit}\`);
        const json = await res.json();
        if (!json.success) return;

        state.orders = json.orders;
        state.ordersTotal = json.total;

        renderOrdersTableRows(json.orders);
        updateOrdersPagination(json.total, page);
      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--danger); padding:24px;">Lỗi tải dữ liệu đơn hàng. Vui lòng thử lại.</td></tr>';
      }
    }

    function renderOrdersTableRows(orders) {
      const tbody = document.getElementById('full-orders-body');
      if (!tbody) return;

      if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:32px; color:var(--text-muted);">Không tìm thấy đơn hàng nào phù hợp bộ lọc.</td></tr>';
        return;
      }

      let html = '';
      for (const o of orders) {
        const timeStr = new Date(o.created_at).toLocaleString('vi-VN');
        html += \`
          <tr class="clickable-row" onclick="openOrderDrawer('\${o.order_code}')">
            <td><span class="code-tag">\${timeStr}</span></td>
            <td><strong>\${o.order_code}</strong></td>
            <td>
              <div>\${o.customer_name}</div>
              <div style="font-size:11px; color:var(--text-dim);">\${o.customer_phone}</div>
            </td>
            <td><strong>\${formatVND(o.amount)}</strong></td>
            <td><span class="code-tag">\${o.source}</span></td>
            <td>\${o.odoo_order_id ? \`<span class="code-tag" style="color:var(--primary);">#\${o.odoo_order_id}</span>\` : '<span style="color:var(--text-dim);">Chưa có</span>'}</td>
            <td>
              <div style="display:flex; gap:4px; align-items:center;">
                \${o.ocms_status === 'completed' ? '<span style="color:var(--success);" title="Đã lưu CRM">CRM ✓</span>' : '<span style="color:var(--text-dim);">CRM -</span>'}
                \${o.zalo_sent ? '<span style="color:#0284C7;" title="Đã gửi Zalo">Zalo ✓</span>' : ''}
              </div>
            </td>
            <td>\${(o.payment_method || 'COD').toUpperCase()}</td>
            <td>\${(o.processing_time_ms / 1000).toFixed(1)}s</td>
            <td><span class="status-badge status-\${o.status}">\${o.status}</span></td>
            <td style="text-align:right;">
              <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openOrderDrawer('\${o.order_code}')">Xem</button>
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    function updateOrdersPagination(total, page) {
      const info = document.getElementById('orders-pagination-info');
      const btnPrev = document.getElementById('btn-prev-page');
      const btnNext = document.getElementById('btn-next-page');

      const maxPages = Math.ceil(total / state.ordersLimit) || 1;
      if (info) info.innerText = \`Trang \${page} / \${maxPages} (Tổng \${total} đơn)\`;
      if (btnPrev) btnPrev.disabled = page <= 1;
      if (btnNext) btnNext.disabled = page >= maxPages;
    }

    function changeOrdersPage(delta) {
      loadOrdersTable(state.ordersPage + delta);
    }

    // 8. Order Detail Drawer
    async function openOrderDrawer(orderCode) {
      state.selectedOrderCode = orderCode;
      const drawer = document.getElementById('order-drawer');
      drawer.classList.add('open');

      document.getElementById('drawer-order-code').innerText = \`#\${orderCode}\`;
      document.getElementById('drawer-customer-name').innerText = 'Đang tải...';

      try {
        const res = await fetch(\`/api/v1/orders/\${orderCode}\`);
        const json = await res.json();
        if (!json.success) return;

        const o = json.data;
        document.getElementById('drawer-status-badge').className = \`status-badge status-\${o.status}\`;
        document.getElementById('drawer-status-badge').innerText = o.status;
        document.getElementById('drawer-order-time').innerText = new Date(o.created_at).toLocaleString('vi-VN');
        document.getElementById('drawer-customer-name').innerText = o.customer_name;
        document.getElementById('drawer-customer-phone').innerText = o.customer_phone;
        document.getElementById('drawer-customer-addr').innerText = o.shipping_address;
        document.getElementById('drawer-source').innerText = o.source;
        document.getElementById('drawer-payment').innerText = (o.payment_method || 'COD').toUpperCase();
        document.getElementById('drawer-total-amount').innerText = formatVND(o.amount);

        // Render Items
        const itemsBody = document.getElementById('drawer-items-body');
        if (o.items && o.items.length > 0) {
          let itemHtml = '';
          for (const it of o.items) {
            itemHtml += \`
              <tr>
                <td>\${it.product_name || 'Sản phẩm'}</td>
                <td><span class="code-tag">\${it.sku || '--'}</span></td>
                <td>\${it.quantity}</td>
                <td style="text-align:right;">\${formatVND(it.price)}</td>
                <td style="text-align:right;"><strong>\${formatVND(it.quantity * it.price)}</strong></td>
              </tr>
            \`;
          }
          itemsBody.innerHTML = itemHtml;
        } else {
          itemsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Không có dòng sản phẩm</td></tr>';
        }

        // Render Timeline
        const timelineEl = document.getElementById('drawer-timeline');
        let tlHtml = '';
        for (const t of o.timeline) {
          tlHtml += \`
            <div class="timeline-item">
              <div class="timeline-point \${t.status}">\${t.step}</div>
              <div class="timeline-content">
                <div class="timeline-time">\${t.time} • \${t.node}</div>
                <div class="timeline-title">\${t.title}</div>
                <div class="timeline-desc">\${t.description}</div>
              </div>
            </div>
          \`;
        }
        timelineEl.innerHTML = tlHtml;

        // Show retry button if failed
        const retryBtn = document.getElementById('drawer-retry-btn');
        if (retryBtn) {
          retryBtn.style.display = o.status === 'FAILED' ? 'inline-flex' : 'none';
        }
      } catch (e) {
        console.warn('Lỗi đọc chi tiết đơn:', e);
      }
    }

    function closeOrderDrawer() {
      document.getElementById('order-drawer').classList.remove('open');
      state.selectedOrderCode = null;
    }

    function retryDrawerOrder() {
      if (state.selectedOrderCode) {
        showToast('Kích hoạt thử lại đơn ' + state.selectedOrderCode);
      }
    }

    // 9. Activity Timeline & Filter
    async function loadActivityTimeline(filter = 'ALL') {
      try {
        const res = await fetch(\`/api/v1/activity?limit=25&filter=\${filter}\`);
        const json = await res.json();
        if (!json.success) return;

        state.activities = json.data;
        renderActivityTimeline(json.data);
      } catch (e) {
        console.warn('Lỗi tải activity timeline:', e);
      }
    }

    function renderActivityTimeline(items) {
      const container = document.getElementById('recent-activity-timeline');
      if (!container) return;

      if (!items || items.length === 0) {
        container.innerHTML = '<div style="padding:14px; color:var(--text-muted); font-size:12px;">Chưa có hoạt động nào được ghi nhận.</div>';
        return;
      }

      let html = '';
      for (const it of items) {
        const timeStr = new Date(it.timestamp).toLocaleTimeString('vi-VN');
        const statusClass = it.level === 'SUCCESS' ? 'completed' : (it.level === 'ERROR' ? 'failed' : 'processing');
        html += \`
          <div class="timeline-item">
            <div class="timeline-point \${statusClass}">●</div>
            <div class="timeline-content">
              <div class="timeline-time">\${timeStr} • <span class="code-tag">\${it.service}</span></div>
              <div class="timeline-title">\${it.message}</div>
            </div>
          </div>
        \`;
      }
      container.innerHTML = html;
    }

    function filterActivity(filterType, btnEl) {
      if (btnEl) {
        btnEl.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
      }
      loadActivityTimeline(filterType);
    }

    // 10. Log Viewer
    let logSearchTimer = null;
    function debounceLogSearch() {
      clearTimeout(logSearchTimer);
      logSearchTimer = setTimeout(() => loadLogsTable(0), 300);
    }

    async function loadLogsTable(offset = 0) {
      const tbody = document.getElementById('logs-table-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px;">Đang nạp logs...</td></tr>';

      const search = document.getElementById('log-search-input')?.value || '';
      const level = document.getElementById('log-filter-level')?.value || 'ALL';
      const service = document.getElementById('log-filter-service')?.value || 'ALL';

      try {
        const res = await fetch(\`/api/v1/logs?search=\${encodeURIComponent(search)}&level=\${level}&service=\${service}&offset=\${offset}&limit=50\`);
        const json = await res.json();
        if (!json.success) return;

        state.logs = json.logs;
        const total = json.total;

        document.getElementById('logs-pagination-info').innerText = \`Hiển thị \${json.logs.length} / \${total} logs\`;

        if (json.logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">Không có dòng log nào khớp với tiêu chí.</td></tr>';
          return;
        }

        let html = '';
        for (const l of json.logs) {
          const timeStr = new Date(l.timestamp).toLocaleTimeString('vi-VN');
          const levelColor = l.level === 'SUCCESS' ? 'var(--success)' : (l.level === 'ERROR' ? 'var(--danger)' : (l.level === 'WARN' ? 'var(--warning)' : 'var(--primary)'));
          html += \`
            <tr>
              <td><span class="code-tag">\${timeStr}</span></td>
              <td><strong style="color:\${levelColor};">\${l.level}</strong></td>
              <td><span class="code-tag">\${l.service}</span></td>
              <td>\${l.queue ? \`<span class="code-tag">\${l.queue}</span>\` : '--'}</td>
              <td>\${l.order_id ? \`<strong>\${l.order_id}</strong>\` : (l.event || '--')}</td>
              <td style="font-family:'JetBrains Mono',monospace; font-size:11px;">\${l.message}</td>
            </tr>
          \`;
        }
        tbody.innerHTML = html;
      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--danger); padding:24px;">Lỗi tải dữ liệu log.</td></tr>';
      }
    }

    // 11. Event Routing Rules
    async function loadRoutingRules() {
      try {
        const res = await fetch('/api/v1/routes');
        const json = await res.json();
        if (!json.success) return;

        state.rules = json.data;
        renderRoutingRulesTable(json.data.events);
      } catch (e) {
        console.warn('Lỗi tải routing rules:', e);
      }
    }

    function renderRoutingRulesTable(events) {
      const tbody = document.getElementById('routing-rules-body');
      if (!tbody) return;

      let html = '';
      for (const [eventId, ev] of Object.entries(events)) {
        for (const target of ev.targets) {
          html += \`
            <tr>
              <td>
                <div style="font-weight:600;">\${ev.name}</div>
                <span class="code-tag">\${eventId}</span>
              </td>
              <td>
                <strong>\${target.icon || '📦'} \${target.name}</strong>
                <div style="font-size:11px; color:var(--text-dim);">\${target.description}</div>
              </td>
              <td><span class="code-tag" style="color:var(--primary);">\${target.queue}</span></td>
              <td><code>\${target.action}</code></td>
              <td>\${target.retry_attempts || 3} lần</td>
              <td style="text-align:right;">
                <label class="switch">
                  <input type="checkbox" \${target.enabled ? 'checked' : ''} onchange="toggleRoute('\${eventId}', '\${target.id}', this.checked)">
                  <span class="slider"></span>
                </label>
              </td>
            </tr>
          \`;
        }
      }
      tbody.innerHTML = html;
    }

    async function toggleRoute(eventId, targetId, enabled) {
      try {
        const res = await fetch('/api/v1/routes/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, target_id: targetId, enabled })
        });
        const json = await res.json();
        if (json.success) {
          showToast(\`Đã \${enabled ? 'BẬT' : 'TẮT'} điểm đích \${targetId}\`);
          loadRoutingRules();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (e) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    // 12. Odoo Configuration Form
    let selectedCfgEnv = 'odoo_test';
    function selectConfigEnv(envKey) {
      selectedCfgEnv = envKey;
      document.getElementById('cfg-tab-test').classList.toggle('active', envKey === 'odoo_test');
      document.getElementById('cfg-tab-prod').classList.toggle('active', envKey === 'odoo_prod');
      populateConfigForm();
    }

    function populateConfigForm() {
      if (!state.systems?.systems) return;
      const sys = state.systems.systems[selectedCfgEnv] || {};
      const activeKey = state.systems.active_odoo_target || 'odoo_test';
      const isActive = activeKey === selectedCfgEnv;

      const elUrl = document.getElementById('cfg-url');
      const elDb = document.getElementById('cfg-db');
      const elUser = document.getElementById('cfg-user');
      const elApiKey = document.getElementById('cfg-apikey');

      if (elUrl) elUrl.value = sys.url || '';
      if (elDb) elDb.value = sys.db || 'odoo';
      if (elUser) elUser.value = sys.user || 'sale.order01@gmai.com';
      if (elApiKey) elApiKey.value = sys.apiKey || '';

      const statusEl = document.getElementById('cfg-active-status');
      if (statusEl) {
        statusEl.innerHTML = isActive
          ? '<span class="status-badge status-SUCCESS">● Đang là máy chủ tiếp nhận đơn hàng</span>'
          : \`<button class="btn btn-secondary btn-sm" onclick="switchOdooTarget('\${selectedCfgEnv}')">🎯 Đặt làm máy chủ tiếp nhận</button>\`;
      }
    }

    async function saveCurrentOdooConfig() {
      const url = document.getElementById('cfg-url')?.value.trim();
      const db = document.getElementById('cfg-db')?.value.trim();
      const user = document.getElementById('cfg-user')?.value.trim();
      const apiKey = document.getElementById('cfg-apikey')?.value.trim();

      if (!url || !db || !user || !apiKey) {
        showToast('Vui lòng điền đầy đủ URL, Database, User và API Key');
        return;
      }

      const isTest = selectedCfgEnv === 'odoo_test';
      try {
        const res = await fetch('/api/v1/registry/systems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedCfgEnv,
            name: isTest ? 'Odoo ERP (Môi trường Test)' : 'Odoo ERP (Môi trường Chính thức)',
            type: isTest ? 'erp_test' : 'erp_prod',
            url, db, user, apiKey,
            description: isTest ? 'Máy chủ Odoo thử nghiệm' : 'Máy chủ Odoo sản xuất chính thức',
            status: 'active',
          })
        });
        const json = await res.json();
        if (json.success) {
          showToast('Đã lưu cấu hình Odoo thành công!');
          loadSystemsDirectory();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (e) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    async function testCurrentOdooConnection() {
      const url = document.getElementById('cfg-url')?.value.trim();
      const db = document.getElementById('cfg-db')?.value.trim();
      const user = document.getElementById('cfg-user')?.value.trim();
      const apiKey = document.getElementById('cfg-apikey')?.value.trim();

      if (!url || !db || !user || !apiKey) {
        showToast('Vui lòng điền đủ thông tin trước khi kiểm tra');
        return;
      }

      const alertEl = document.getElementById('cfg-alert');
      if (alertEl) {
        alertEl.style.display = 'block';
        alertEl.style.background = '#EFF6FF';
        alertEl.style.color = 'var(--primary)';
        alertEl.innerHTML = '⏳ Đang kiểm tra xác thực XML-RPC tới Odoo...';
      }

      try {
        const res = await fetch('/api/v1/registry/test-odoo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, db, user, apiKey }),
        });
        const json = await res.json();

        if (alertEl) {
          if (json.success) {
            alertEl.style.background = 'var(--success-subtle)';
            alertEl.style.color = 'var(--success)';
            alertEl.innerHTML = \`✅ <strong>\${json.message || 'Kết nối thành công!'}</strong> (UID: \${json.uid})\`;
          } else {
            alertEl.style.background = 'var(--danger-subtle)';
            alertEl.style.color = 'var(--danger)';
            alertEl.innerHTML = \`❌ <strong>Lỗi kết nối Odoo:</strong> \${json.error || 'Sai thông tin'}\`;
          }
        }
      } catch (e) {
        if (alertEl) {
          alertEl.style.background = 'var(--danger-subtle)';
          alertEl.style.color = 'var(--danger)';
          alertEl.innerHTML = '❌ Lỗi kết nối mạng: ' + e.message;
        }
      }
    }

    // Reset Queues & Lịch Sử Đơn Hàng (Bảo lưu cấu hình)
    async function confirmResetQueues() {
      const msg = '⚠️ CẢNH BÁO: Thao tác này sẽ dọn sạch toàn bộ các hàng đợi (queue_odoo, queue_ocms) và lịch sử đơn hàng.\\n\\n' +
        '✓ TOÀN BỘ CẤU HÌNH (Routing Rules, Danh bạ Odoo ERP, API credentials) SẼ ĐƯỢC GIỮ NGUYÊN 100%.\\n\\n' +
        'Bạn có chắc chắn muốn thực hiện reset không?';
      if (!confirm(msg)) return;

      showToast('Đang tiến hành reset hàng đợi...');
      try {
        const res = await fetch('/api/v1/queues/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearLogs: true })
        });
        const json = await res.json();
        if (json.success) {
          showToast('✓ ' + json.message);
          refreshAll(true);
        } else {
          showToast('❌ Lỗi reset: ' + (json.error || 'Thất bại'));
        }
      } catch (e) {
        showToast('❌ Lỗi kết nối khi gọi reset queue');
      }
    }

    // 13. Simulator: Bắn Đơn Mẫu
    async function triggerTestOrder() {
      const code = 'LP' + Math.floor(100000 + Math.random() * 900000);
      showToast(\`Đang ném đơn mẫu \${code} vào Router...\`);

      try {
        const res = await fetch('/api/v1/orders/standard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_code: code,
            source: 'store_lapet',
            customer_name: 'Khách Hàng Thử Nghiệm LaPet',
            customer_phone: '0987654321',
            shipping_address: '123 Đường Số 1, Phường 2, TP.HCM',
            items: [
              { sku: 'SP-DEMO-01', product_name: 'Pate Mèo Royal Canin', quantity: 2, price: 120000 }
            ],
            total_amount: 240000,
            payment_method: 'cod'
          })
        });
        const json = await res.json();
        if (json.success) {
          showToast(\`✓ Đơn \${code} đã chuyển tới \${json.data?.dispatched?.length || 0} hàng đợi!\`);
          refreshAll(false);
          openOrderDrawer(code);
        } else {
          showToast('Lỗi bắn đơn: ' + json.error);
        }
      } catch (e) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    // 14. Add System Modal
    function openAddSystemModal() {
      document.getElementById('add-system-modal').classList.add('open');
    }
    function closeAddSystemModal() {
      document.getElementById('add-system-modal').classList.remove('open');
    }
    async function handleAddSystem(e) {
      e.preventDefault();
      const id = document.getElementById('sys-id').value.trim();
      const name = document.getElementById('sys-name').value.trim();
      const type = document.getElementById('sys-type').value;
      const url = document.getElementById('sys-url').value.trim();
      const desc = document.getElementById('sys-desc').value.trim();

      try {
        const res = await fetch('/api/v1/registry/systems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, type, url, description: desc, status: 'active' })
        });
        const json = await res.json();
        if (json.success) {
          showToast(json.message);
          closeAddSystemModal();
          loadSystemsDirectory();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (err) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    async function deleteSystem(sysId) {
      if (!confirm('Bạn có chắc chắn muốn xóa hệ thống này khỏi danh bạ?')) return;
      try {
        const res = await fetch(\`/api/v1/registry/systems/\${sysId}\`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
          showToast(json.message);
          loadSystemsDirectory();
        } else {
          showToast('Lỗi: ' + json.error);
        }
      } catch (err) {
        showToast('Lỗi kết nối máy chủ');
      }
    }

    // 15. Analytics Charts
    function renderAnalyticsCharts() {
      if (!state.kpi) return;

      // Status Donut
      const canvasDonut = document.getElementById('chart-status-donut');
      if (canvasDonut && !state.statusDonutChart) {
        state.statusDonutChart = new Chart(canvasDonut.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Thành công', 'Đang xử lý', 'Đang thử lại', 'Lỗi'],
            datasets: [{
              data: [state.kpi.successful, state.kpi.processing, state.kpi.retrying, state.kpi.failed],
              backgroundColor: ['#16A34A', '#2563EB', '#D97706', '#DC2626'],
              borderWidth: 2,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
          }
        });
      }

      // Latency Bar Chart
      const canvasLatency = document.getElementById('chart-latency-bar');
      if (canvasLatency && !state.latencyBarChart) {
        state.latencyBarChart = new Chart(canvasLatency.getContext('2d'), {
          type: 'bar',
          data: {
            labels: ['< 1s (Siêu tốc)', '1s - 3s (Bình thường)', '3s - 10s (Chậm)', '> 10s (Quá hạn)'],
            datasets: [{
              label: 'Số lượng đơn',
              data: [42, 24, 5, 2],
              backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
              borderRadius: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });
      }
    }

    // Initial Bootstrap
    window.addEventListener('DOMContentLoaded', () => {
      refreshAll(false);
      startAutoRefresh();
      // Auto ping systems
      setTimeout(pingAllSystems, 1000);
    });
  </script>
</body>
</html>
`;
}
