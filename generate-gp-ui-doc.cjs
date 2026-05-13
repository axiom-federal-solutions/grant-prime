const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat
} = require('docx');
const fs = require('fs');

const ACCENT = '3B82F6';
const BLUE   = '1A2540';
const WHITE  = 'FFFFFF';
const LGRAY  = 'F1F5F9';
const MGRAY  = 'CBD5E1';
const DKGRAY = '475569';
const BLACK  = '1E293B';

const bdr = { style: BorderStyle.SINGLE, size: 1, color: MGRAY };
const bdrs = { top: bdr, bottom: bdr, left: bdr, right: bdr };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 36, font: 'Arial', color: BLACK })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial', color: BLACK })] });
}
function body(text, italic) {
  return new Paragraph({ spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: BLACK, italics: !!italic })] });
}
function bl(text) {
  return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: BLACK })] });
}
function sp(n) {
  return new Paragraph({ spacing: { before: 0, after: (n || 1) * 100 }, children: [new TextRun('')] });
}
function pb() { return new Paragraph({ children: [new PageBreak()] }); }

function hcell(text, w) {
  return new TableCell({ borders: bdrs, width: { size: w, type: WidthType.DXA },
    shading: { fill: BLUE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, bold: true, size: 22, font: 'Arial', color: WHITE })] })] });
}
function dcell(text, w, fill, bold) {
  return new TableCell({ borders: bdrs, width: { size: w, type: WidthType.DXA },
    shading: { fill: fill || WHITE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, size: 22, font: 'Arial', color: BLACK, bold: !!bold })] })] });
}
function wf(lines) {
  return lines.map(l => new Paragraph({ spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: l, size: 18, font: 'Courier New', color: DKGRAY })] }));
}
function divLine() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    spacing: { before: 160, after: 160 }, children: [new TextRun('')] });
}
function tbl(colWidths, rows) {
  return new Table({ width: { size: colWidths.reduce((a,b)=>a+b,0), type: WidthType.DXA }, columnWidths: colWidths, rows });
}
function tr(cells) { return new TableRow({ children: cells }); }

const doc = new Document({
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
  ]},
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: BLACK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: BLACK },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: BLACK },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    headers: { default: new Header({ children: [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
      spacing: { before: 0, after: 100 },
      children: [
        new TextRun({ text: 'GRANT PRIME', bold: true, size: 20, color: ACCENT, font: 'Arial' }),
        new TextRun({ text: '   |   UI Interface Analysis & Design Reference', size: 20, color: DKGRAY, font: 'Arial' })
      ]
    })]}) },
    footers: { default: new Footer({ children: [new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: MGRAY, space: 4 } },
      spacing: { before: 100, after: 0 },
      children: [
        new TextRun({ text: 'Noble Erne, LLC  |  Confidential  |  May 2026     Page ', size: 18, color: DKGRAY, font: 'Arial' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: DKGRAY, font: 'Arial' })
      ]
    })]}) },
    children: [

      // COVER
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1440, after: 200 },
        children: [new TextRun({ text: 'GRANT PRIME', bold: true, size: 80, color: ACCENT, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: 'UI Interface Analysis & Design Reference', size: 36, color: BLACK, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 480 },
        children: [new TextRun({ text: 'Noble Erne, LLC  |  May 2026', size: 24, color: DKGRAY, font: 'Arial' })] }),
      divLine(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 480 },
        children: [new TextRun({ text: 'Annotated wireframes, component specs, and design rationale for every panel in the GRANT PRIME Command Center. Single source of truth for UI decisions, enhancements, and onboarding.', size: 22, color: DKGRAY, font: 'Arial' })] }),
      pb(),

      // 1. SYSTEM OVERVIEW
      h1('1. System Overview'),
      body('GRANT PRIME is a single-file HTML dashboard (index.html) that connects directly to Supabase via the browser JS client. No server, no build step, no hosting — open the file in any browser and it loads live data.'),
      sp(),
      tbl([2340, 7020], [
        tr([hcell('Attribute', 2340), hcell('Value', 7020)]),
        tr([dcell('File', 2340, LGRAY, true),      dcell('index.html — HTML, CSS, and JS all inline (single file)', 7020)]),
        tr([dcell('Access', 2340, LGRAY, true),     dcell('file:// in any browser — no server or hosting needed', 7020)]),
        tr([dcell('Database', 2340, LGRAY, true),   dcell('Supabase PostgreSQL — anon key embedded, safe for client-side', 7020)]),
        tr([dcell('Refresh', 2340, LGRAY, true),    dcell('Auto every 5 min via setInterval(); Ctrl+Shift+R for immediate', 7020)]),
        tr([dcell('Auth', 2340, LGRAY, true),       dcell('None — PIN screen removed; opens directly to dashboard', 7020)]),
        tr([dcell('Data limit', 2340, LGRAY, true), dcell('500 grants per load (.select("*").limit(500))', 7020)]),
      ]),
      sp(2), pb(),

      // 2. GLOBAL LAYOUT
      h1('2. Global Layout'),
      body('Two-column layout: fixed 60px sidebar on the left, flexible scrollable main content area on the right.'),
      sp(),
      h3('2.1 Layout Wireframe'),
      ...wf([
        '+------------------+------------------------------------------+',
        '|   SIDEBAR (60px) |   MAIN CONTENT AREA (scrollable)        |',
        '|                  |                                          |',
        '|  [GP] logo       |   Panel renders here based on nav pick  |',
        '|  [~] Home        |                                          |',
        '|  [#] Grants      |                                          |',
        '|  [!] Action Q    |                                          |',
        '|  [|] Pipeline    |                                          |',
        '|  [@] Contacts    |                                          |',
        '+------------------+------------------------------------------+',
      ]),
      sp(),
      h3('2.2 Sidebar Navigation'),
      tbl([2340, 3510, 3510], [
        tr([hcell('Element', 2340), hcell('JS Call', 3510), hcell('Notes', 3510)]),
        tr([dcell('Home', 2340),         dcell('showPanel("home")', 3510),     dcell('Default panel on page load', 3510)]),
        tr([dcell('Grants', 2340),       dcell('showPanel("grants")', 3510),   dcell('Full grant library + filters', 3510)]),
        tr([dcell('Action Queue', 2340), dcell('showPanel("action")', 3510),   dcell('Score >= 60, not yet applied', 3510)]),
        tr([dcell('Pipeline', 2340),     dcell('showPanel("pipeline")', 3510), dcell('Status-based kanban view', 3510)]),
        tr([dcell('Contacts', 2340),     dcell('showPanel("contacts")', 3510), dcell('Funder relationship table', 3510)]),
      ]),
      sp(2), pb(),

      // 3. COMMAND CENTER
      h1('3. Home — Command Center'),
      body('The operational hub. Surfaces the daily pipeline briefing, global search, and grant source stats. First panel on every open.'),
      sp(),
      h3('3.1 Wireframe'),
      ...wf([
        '+----------------------------------------------------------+',
        '|  COMMAND CENTER                       [  Search bar... ] |',
        '|                                                          |',
        '|  +----------------------+   +-----------------------+   |',
        '|  | DAILY BRIEFING       |   | PIPELINE STATS        |   |',
        '|  | Last run: today 6AM  |   | New:     24           |   |',
        '|  | Discovered: 12 new   |   | Scored:  180          |   |',
        '|  | High score: 3 (>=80) |   | Alerted: 45           |   |',
        '|  | Agents: All OK       |   | Applied: 3            |   |',
        '|  +----------------------+   +-----------------------+   |',
        '|                             +-----------------------+   |',
        '|                             | SOURCE BREAKDOWN      |   |',
        '|                             | Federal:     72       |   |',
        '|                             | EdTech/DOL:  36       |   |',
        '|                             | State/Local: 93       |   |',
        '|                             | Foundation:   1       |   |',
        '|                             +-----------------------+   |',
        '+----------------------------------------------------------+',
      ]),
      sp(),
      h3('3.2 Daily Briefing Card'),
      body('Reads most recent row from system_log (ORDER BY created_at DESC LIMIT 1). Displays:'),
      bl('Agent name and run timestamp'),
      bl('Grants discovered and scored counts (from details JSONB field)'),
      bl('High-score count (score >= 80)'),
      bl('Agent status: success or error'),
      bl('Empty state: onboarding message when system_log has no rows yet'),
      sp(),
      h3('3.3 Search Bar'),
      bl('Debounced — Supabase query fires 300ms after user stops typing'),
      bl('Dropdown shows up to 10 matching grants (title + description)'),
      bl('Clicking a result opens the Grant Detail modal'),
      bl('Clicking outside the dropdown dismisses it (document click listener)'),
      sp(2), pb(),

      // 4. GRANTS PANEL
      h1('4. Grants Panel'),
      body('Primary browsing interface. Three filter layers stack: entity tab > category sub-tab > quick filters + budget range. Results render as a responsive card grid.'),
      sp(),
      h3('4.1 Wireframe'),
      ...wf([
        '+----------------------------------------------------------+',
        '|  [ Noble Erne ] [ Walker Contractors ] [ Both ] [ All ]  |',
        '|  [ EdTech ] [ STEM ] [ Construction ] [ Federal ] [ All ]|',
        '|                                                          |',
        '|  [ High Score ]  [ Active ]  [ New This Week ]           |',
        '|  Budget  $[ min ] to $[ max ]   [ Apply ]                |',
        '|                                                          |',
        '|  +-------------+  +-------------+  +-------------+      |',
        '|  | GRANT CARD  |  | GRANT CARD  |  | GRANT CARD  |      |',
        '|  | Title...    |  | Title...    |  | Title...    |      |',
        '|  | Agency      |  | Agency      |  | Agency      |      |',
        '|  | [  87  ]    |  | [  72  ]    |  | [  65  ]    |      |',
        '|  | Dec 15 2026 |  | Jul 30 2026 |  | Oct 1 2026  |      |',
        '|  | [Noble]     |  | [Both]      |  | [Walker]    |      |',
        '|  +-------------+  +-------------+  +-------------+      |',
        '+----------------------------------------------------------+',
      ]),
      sp(),
      h3('4.2 Entity Tabs'),
      tbl([2808, 3276, 3276], [
        tr([hcell('Tab', 2808), hcell('Filter Logic', 3276), hcell('Badge', 3276)]),
        tr([dcell('Noble Erne', 2808),        dcell('entity_fit contains "Noble"', 3276),   dcell('None', 3276)]),
        tr([dcell('Walker Contractors', 2808), dcell('entity_fit contains "Walker"', 3276), dcell('SDVOSB (gold badge)', 3276)]),
        tr([dcell('Both', 2808),               dcell('entity_fit = "[Both]"', 3276),        dcell('None', 3276)]),
        tr([dcell('All', 2808),                dcell('No entity filter applied', 3276),     dcell('None', 3276)]),
      ]),
      sp(),
      h3('4.3 Quick Filters'),
      tbl([2340, 7020], [
        tr([hcell('Filter', 2340), hcell('Logic', 7020)]),
        tr([dcell('High Score', 2340),    dcell('score >= 80', 7020)]),
        tr([dcell('Active', 2340),        dcell('deadline >= today OR deadline IS NULL', 7020)]),
        tr([dcell('New This Week', 2340), dcell('created_at >= today minus 7 days', 7020)]),
        tr([dcell('Budget Range', 2340),  dcell('amount_min >= input AND amount_max <= input — fires on [Apply] click', 7020)]),
      ]),
      sp(),
      h3('4.4 Grant Card Fields'),
      bl('Title — CSS overflow truncated at 2 lines'),
      bl('Agency name'),
      bl('Score badge: green (#22C55E) >= 80, amber (#F59E0B) 60-79, gray < 60'),
      bl('Deadline: red if < 7 days, amber if < 14 days'),
      bl('Entity tag: [Noble Erne], [Walker Contractors], or [Both]'),
      bl('onClick: openGrantDetail(g.grant_id || g.id) — null-safe fallback'),
      sp(2), pb(),

      // 5. GRANT DETAIL MODAL
      h1('5. Grant Detail Modal'),
      body('Full-detail overlay triggered by clicking any grant card. All fields read-only except "Your Notes" — the only user-writable field in the system.'),
      sp(),
      h3('5.1 Wireframe'),
      ...wf([
        '+----------------------------------------------+',
        '|  [X] Close                                   |',
        '|                                              |',
        '|  GRANT TITLE HERE                   [ 87 ]  |',
        '|  Agency Name                                 |',
        '|                                              |',
        '|  Deadline:  December 15, 2026                |',
        '|  Budget:    $25,000 - $500,000               |',
        '|  Entity:    [Noble Erne]                     |',
        '|  Category:  EdTech                           |',
        '|  [ View Original Opportunity -> ]            |',
        '|                                              |',
        '|  DESCRIPTION                                 |',
        '|  Full opportunity text from source...        |',
        '|                                              |',
        '|  AI REASONING  (read-only)                   |',
        '|  Claude Haiku scored this 87 because...      |',
        '|                                              |',
        '|  YOUR NOTES                                  |',
        '|  +------------------------------------------+|',
        '|  |  user_notes — editable textarea          ||',
        '|  +------------------------------------------+|',
        '|  [ Save Notes ]                              |',
        '|                                              |',
        '|  [ Export CSV ]                 [ Close ]   |',
        '+----------------------------------------------+',
      ]),
      sp(),
      h3('5.2 DB Column Mapping'),
      tbl([2808, 3276, 3276], [
        tr([hcell('UI Field', 2808), hcell('DB Column', 3276), hcell('Editable?', 3276)]),
        tr([dcell('Title / Agency / Score', 2808), dcell('title, agency, score', 3276),       dcell('No', 3276)]),
        tr([dcell('Deadline', 2808),               dcell('deadline', 3276),                   dcell('No', 3276)]),
        tr([dcell('Budget', 2808),                 dcell('amount_min, amount_max', 3276),      dcell('No', 3276)]),
        tr([dcell('Entity / Category', 2808),      dcell('entity_fit, category', 3276),        dcell('No — AI assigned', 3276)]),
        tr([dcell('Description', 2808),            dcell('description', 3276),                 dcell('No', 3276)]),
        tr([dcell('AI Reasoning', 2808),           dcell('notes', 3276),                       dcell('No — AI read-only', 3276)]),
        tr([dcell('Your Notes', 2808),             dcell('user_notes', 3276),                  dcell('YES — user editable', 3276)]),
      ]),
      sp(),
      body('CSV export (13 columns): title, agency, deadline, score, entity_fit, category, amount_min, amount_max, status, source, source_url, user_notes, grant_id', true),
      sp(2), pb(),

      // 6. ACTION QUEUE
      h1('6. Action Queue'),
      body('High-relevance grants needing immediate attention — scored but not yet applied. Sorted by score descending.'),
      sp(),
      h3('6.1 Wireframe'),
      ...wf([
        '+----------------------------------------------------------+',
        '|  ACTION QUEUE                                            |',
        '|  High-priority opportunities requiring action            |',
        '|                                                          |',
        '|  Budget  $[ min ] to $[ max ]   [ Apply Filter ]        |',
        '|                                                          |',
        '|  #  | Title                 | Score | Deadline | Entity |',
        '|  ---+-----------------------+-------+----------+--------  |',
        '|  1  | DOL Workforce Dev     | [ 92] | Jun 30   | Noble  |',
        '|  2  | SBIR Phase I          | [ 85] | Jul 15   | Both   |',
        '|  3  | VA Capacity Build     | [ 81] | Aug 1    | Walker |',
        '+----------------------------------------------------------+',
      ]),
      sp(),
      body('Filter: score >= 60 AND status != "applied" AND (deadline >= today OR deadline IS NULL). Budget range is an optional additional client-side filter.'),
      sp(2), pb(),

      // 7. PIPELINE
      h1('7. Pipeline View'),
      body('Organizes all grants by workflow status across four sequential stages.'),
      sp(),
      h3('7.1 Wireframe'),
      ...wf([
        '+----------+  +----------+  +----------+  +----------+',
        '|   NEW    |  |  SCORED  |  | ALERTED  |  | APPLIED  |',
        '|          |  |          |  |          |  |          |',
        '| Grant A  |  | Grant C  |  | Grant E  |  | Grant G  |',
        '| Grant B  |  | Grant D  |  |          |  |          |',
        '|          |  |          |  |          |  |          |',
        '| 24 total |  |180 total |  | 45 total |  | 3 total  |',
        '+----------+  +----------+  +----------+  +----------+',
      ]),
      sp(),
      h3('7.2 Status Definitions'),
      tbl([1872, 2808, 4680], [
        tr([hcell('Status', 1872), hcell('Set By', 2808), hcell('Meaning', 4680)]),
        tr([dcell('new', 1872),     dcell('Discovery agent on insert', 2808),    dcell('Just found — awaiting AI scoring', 4680)]),
        tr([dcell('scored', 1872),  dcell('Scoring agent (Claude Haiku)', 2808), dcell('AI score + entity_fit assigned', 4680)]),
        tr([dcell('alerted', 1872), dcell('Alert agent on email send', 2808),    dcell('High-score notification sent', 4680)]),
        tr([dcell('applied', 1872), dcell('Manual user update', 2808),           dcell('Application submitted', 4680)]),
      ]),
      sp(2), pb(),

      // 8. FUNDER CONTACTS
      h1('8. Funder Contacts'),
      body('Relationship management for program officers, foundation reps, and agency contacts. Reads from funder_contacts table in Supabase.'),
      sp(),
      h3('8.1 Wireframe'),
      ...wf([
        '+----------------------------------------------------------+',
        '|  FUNDER CONTACTS                   [ + Add Contact ]     |',
        '|                                                          |',
        '|  Funder Name     | Contact Name | Email       | Notes   |',
        '|  ----------------+--------------+-------------+---------  |',
        '|  Lumina Found.   | Jane Smith   | j@lumina    | Call Q2 |',
        '|  DOL/ETA         | John Doe     | jdoe@dol    | Met conf|',
        '|  NIH NIDCD       | --           | --          | --      |',
        '+----------------------------------------------------------+',
      ]),
      sp(),
      body('Prerequisite: funder_contacts table must exist (Migration 004 SQL). If missing, panel shows "Could not find table" error. Run the migration in Supabase SQL Editor to resolve.', true),
      sp(2), pb(),

      // 9. DESIGN SYSTEM
      h1('9. Design System'),
      sp(),
      h3('9.1 CSS Color Tokens'),
      tbl([2340, 2340, 4680], [
        tr([hcell('Token', 2340), hcell('Hex', 2340), hcell('Usage', 4680)]),
        tr([dcell('--bg1', 2340),    dcell('#060A14', 2340), dcell('Page background (darkest layer)', 4680)]),
        tr([dcell('--bg2', 2340),    dcell('#0B0F1A', 2340), dcell('Sidebar background — must be in :root or sidebar is invisible', 4680)]),
        tr([dcell('--bg3', 2340),    dcell('#0F1424', 2340), dcell('Card/panel background — must be in :root or cards are transparent', 4680)]),
        tr([dcell('--accent', 2340), dcell('#3B82F6', 2340), dcell('Brand blue — active tabs, buttons, links', 4680)]),
        tr([dcell('--green', 2340),  dcell('#22C55E', 2340), dcell('High score badge (>= 80), success states', 4680)]),
        tr([dcell('--amber', 2340),  dcell('#F59E0B', 2340), dcell('Mid score badge (60-79), 14-day deadline warning', 4680)]),
        tr([dcell('--red', 2340),    dcell('#EF4444', 2340), dcell('Urgent deadline (< 7 days), error states', 4680)]),
        tr([dcell('--text', 2340),   dcell('#E2E8F0', 2340), dcell('Primary text on dark backgrounds', 4680)]),
        tr([dcell('--muted', 2340),  dcell('#94A3B8', 2340), dcell('Secondary / metadata text', 4680)]),
      ]),
      sp(),
      body('Gap A (fixed): --bg2 and --bg3 were missing from :root in early deployment, causing invisible sidebar and transparent cards. Both must be explicitly defined.', true),
      sp(),
      h3('9.2 Score Badge Color Rules'),
      tbl([3120, 3120, 3120], [
        tr([hcell('Score Range', 3120), hcell('Color', 3120), hcell('Recommended Action', 3120)]),
        tr([dcell('80 – 100', 3120), dcell('Green (#22C55E)', 3120), dcell('Priority — pursue immediately', 3120)]),
        tr([dcell('60 – 79', 3120),  dcell('Amber (#F59E0B)', 3120), dcell('Review — assess before committing', 3120)]),
        tr([dcell('0 – 59', 3120),   dcell('Gray (#64748B)', 3120),  dcell('Low priority — monitor only', 3120)]),
      ]),
      sp(2), pb(),

      // 10. DATA FLOW
      h1('10. Data Flow & State'),
      sp(),
      h3('10.1 Page Load Sequence'),
      bl('1. window.onerror registered — JS crashes display as red overlay on screen'),
      bl('2. Supabase createClient() called — wrapped in try/catch with null guard'),
      bl('3. renderHome() builds sidebar and initial panel structure'),
      bl('4. loadData() fires immediately — no auth gate (PIN removed)'),
      bl('5. Grants, alerts, and system_log fetched in parallel from Supabase'),
      bl('6. UI re-renders with live data from all three tables'),
      bl('7. setInterval(loadData, 300000) — auto-refresh every 5 minutes'),
      sp(),
      h3('10.2 Notes Save Flow'),
      body('User edits textarea in Grant Detail modal > clicks "Save Notes":'),
      bl('saveNotes(grantId, value) is called'),
      bl('Supabase PATCH: { user_notes: value } WHERE id = grantId'),
      bl('Local state updated: g.user_notes = value — no full reload needed'),
      body('CRITICAL: notes = AI reasoning (read-only). user_notes = user input (writable). Swapping these was Gap B — now fixed.', true),
      sp(),
      h3('10.3 Error Handling'),
      tbl([3120, 6240], [
        tr([hcell('Error', 3120), hcell('Recovery', 6240)]),
        tr([dcell('Supabase CDN fails to load', 3120),   dcell('Null check -> "Database unavailable" shown', 6240)]),
        tr([dcell('JS syntax error in script', 3120),    dcell('window.onerror catches it -> red overlay displayed on page', 6240)]),
        tr([dcell('DB table not found', 3120),           dcell('Error string shown in panel instead of data', 6240)]),
        tr([dcell('Null grant_id on card click', 3120),  dcell('g.grant_id || g.id fallback prevents crash', 6240)]),
        tr([dcell('Blank panel after file save', 3120),  dcell('Browser cached old file — Ctrl+Shift+R resolves', 6240)]),
      ]),
      sp(2), pb(),

      // 11. ROADMAP
      h1('11. Enhancement Roadmap'),
      sp(),
      h3('11.1 Known Limitations'),
      bl('500-grant load limit — pagination needed when pipeline exceeds this'),
      bl('No in-dashboard status update — must use Supabase to mark "applied"'),
      bl('Single-grant CSV export only — no bulk export from filtered list'),
      bl('funder_contacts table requires manual Supabase migration'),
      bl('No offline mode — internet connection required for all data'),
      sp(),
      h3('11.2 Prioritized Enhancements'),
      tbl([1872, 3744, 3744], [
        tr([hcell('Priority', 1872), hcell('Feature', 3744), hcell('Notes', 3744)]),
        tr([dcell('High', 1872),   dcell('"Mark Applied" button in detail modal', 3744),    dcell('No more opening Supabase dashboard', 3744)]),
        tr([dcell('High', 1872),   dcell('Bulk CSV export from filtered list', 3744),       dcell('One-click export of current filter results', 3744)]),
        tr([dcell('Medium', 1872), dcell('Pagination (100 grants per page)', 3744),         dcell('Removes 500-grant ceiling', 3744)]),
        tr([dcell('Medium', 1872), dcell('Grant archiving', 3744),                          dcell('Hide expired/irrelevant grants from default views', 3744)]),
        tr([dcell('Low', 1872),    dcell('Netlify deployment', 3744),                       dcell('Web-hosted version — needs env var security rework', 3744)]),
        tr([dcell('Low', 1872),    dcell('Proposal agent trigger from modal', 3744),        dcell('Button to run grant-proposal-agent for selected grant', 3744)]),
      ]),
      sp(2), pb(),

      // CLOSING
      divLine(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: 'GRANT PRIME', bold: true, size: 32, color: ACCENT, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: 'Noble Erne, LLC  |  Confidential  |  May 2026', size: 20, color: DKGRAY, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'Internal use only. Do not distribute.', size: 18, color: DKGRAY, font: 'Arial', italics: true })] }),
    ]
  }]
});

const outPath = process.argv[2] || 'GRANT_PRIME_UI_Analysis.docx';
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('Written: ' + outPath);
}).catch(err => { console.error(err.message); process.exit(1); });
