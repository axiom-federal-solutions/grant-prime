// GRANT PRIME — UI Interface Analysis Word Document Generator
// Noble Erne, LLC | May 2026
// Run: node generate-gp-ui-doc.js GRANT_PRIME_UI_Analysis.docx

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  ExternalHyperlink
} from 'docx';
import fs from 'fs';

// ── Color palette (Grant Prime brand) ────────────────────────
const NAVY    = '0A0E1A';
const BLUE    = '1A2540';
const ACCENT  = '3B82F6';   // brand blue
const GREEN   = '22C55E';   // score high
const AMBER   = 'F59E0B';   // score mid
const WHITE   = 'FFFFFF';
const LGRAY   = 'F1F5F9';
const MGRAY   = 'CBD5E1';
const DKGRAY  = '475569';
const BLACK   = '1E293B';

// ── Helpers ────────────────────────────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 36, color: BLACK, font: 'Arial' })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: BLACK, font: 'Arial' })]
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, color: opts.color || BLACK, font: 'Arial', bold: opts.bold || false, italics: opts.italic || false })]
  });
}

function bullet(text, ref = 'bullets') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, color: BLACK, font: 'Arial' })]
  });
}

function spacer(lines = 1) {
  return new Paragraph({ spacing: { before: 0, after: lines * 120 }, children: [new TextRun('')] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function cell(content, opts = {}) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: MGRAY };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new TableCell({
    borders,
    width: { size: opts.width || 4680, type: WidthType.DXA },
    shading: { fill: opts.fill || WHITE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: content, size: 22, color: opts.color || BLACK, font: 'Arial', bold: opts.bold || false })]
    })]
  });
}

function headerCell(text, width = 4680) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: MGRAY };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: BLUE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, bold: true, size: 22, color: WHITE, font: 'Arial' })]
    })]
  });
}

function wireframe(lines) {
  return lines.map(line =>
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: line, size: 18, font: 'Courier New', color: DKGRAY })]
    })
  );
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
    spacing: { before: 160, after: 160 },
    children: [new TextRun('')]
  });
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT BUILD
// ═══════════════════════════════════════════════════════════════
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: BLACK } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: BLACK },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 }
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: ACCENT },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 }
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: BLACK },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
          spacing: { before: 0, after: 120 },
          children: [
            new TextRun({ text: 'GRANT PRIME', bold: true, size: 20, color: ACCENT, font: 'Arial' }),
            new TextRun({ text: '  |  UI Interface Analysis', size: 20, color: DKGRAY, font: 'Arial' }),
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: MGRAY, space: 4 } },
          spacing: { before: 120, after: 0 },
          children: [
            new TextRun({ text: 'Noble Erne, LLC  |  Confidential  |  May 2026     Page ', size: 18, color: DKGRAY, font: 'Arial' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: DKGRAY, font: 'Arial' })
          ]
        })]
      })
    },
    children: [

      // ── COVER PAGE ─────────────────────────────────────────
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1440, after: 240 },
        children: [new TextRun({ text: 'GRANT PRIME', bold: true, size: 72, color: ACCENT, font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: 'User Interface Analysis & Design Reference', size: 36, color: BLACK, font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 480 },
        children: [new TextRun({ text: 'Noble Erne, LLC  |  May 2026', size: 24, color: DKGRAY, font: 'Arial' })]
      }),
      divider(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: 'Document Purpose', bold: true, size: 28, color: BLACK, font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 480 },
        children: [new TextRun({
          text: 'Annotated wireframes, component specifications, and design rationale for each interface panel in the GRANT PRIME Command Center dashboard. Single source of truth for UI/UX decisions, future enhancements, and onboarding.',
          size: 22, color: DKGRAY, font: 'Arial'
        })]
      }),
      pageBreak(),

      // ── 1. SYSTEM OVERVIEW ─────────────────────────────────
      h1('1. System Overview'),
      body('GRANT PRIME is a single-file HTML dashboard (index.html) connecting directly to Supabase via the JS client. No web server, no build step, no hosting required. Open the file in any browser and it loads live data.'),
      spacer(),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 7020],
        rows: [
          new TableRow({ children: [headerCell('Attribute', 2340), headerCell('Value', 7020)] }),
          new TableRow({ children: [cell('File', { width: 2340, fill: LGRAY, bold: true }), cell('index.html — HTML, CSS, JS all inline (single file)', { width: 7020 })] }),
          new TableRow({ children: [cell('Access', { width: 2340, fill: LGRAY, bold: true }), cell('file:// in browser — no server, no hosting needed', { width: 7020 })] }),
          new TableRow({ children: [cell('Database', { width: 2340, fill: LGRAY, bold: true }), cell('Supabase PostgreSQL — anon key embedded, safe for client-side', { width: 7020 })] }),
          new TableRow({ children: [cell('Refresh', { width: 2340, fill: LGRAY, bold: true }), cell('Auto every 5 min via setInterval(); Ctrl+Shift+R for immediate refresh', { width: 7020 })] }),
          new TableRow({ children: [cell('Auth', { width: 2340, fill: LGRAY, bold: true }), cell('None — PIN removed; opens directly to dashboard', { width: 7020 })] }),
          new TableRow({ children: [cell('Load limit', { width: 2340, fill: LGRAY, bold: true }), cell('500 grants per session (.select("*").limit(500))', { width: 7020 })] }),
        ]
      }),
      spacer(2),
      pageBreak(),

      // ── 2. GLOBAL LAYOUT ───────────────────────────────────
      h1('2. Global Layout'),
      body('Two-column layout: fixed sidebar (60px) on left, flexible scrollable main content area on right.'),
      spacer(),
      h3('2.1 Layout Wireframe'),
      ...wireframe([
        '+------------------+------------------------------------------+',
        '|   SIDEBAR (60px) |   MAIN CONTENT AREA                     |',
        '|                  |                                          |',
        '|  [GP] logo       |   Panel renders here based on nav       |',
        '|                  |   selection. Scrollable vertically.     |',
        '|  [~] Home        |                                          |',
        '|  [#] Grants      |                                          |',
        '|  [!] Action Q    |                                          |',
        '|  [|] Pipeline    |                                          |',
        '|  [@] Contacts    |                                          |',
        '|                  |                                          |',
        '+------------------+------------------------------------------+',
      ]),
      spacer(),
      h3('2.2 Sidebar Navigation'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 3510, 3510],
        rows: [
          new TableRow({ children: [headerCell('Element', 2340), headerCell('JS Call', 3510), headerCell('Notes', 3510)] }),
          new TableRow({ children: [cell('Home icon', { width: 2340 }), cell('showPanel("home")', { width: 3510 }), cell('Default on load', { width: 3510 })] }),
          new TableRow({ children: [cell('Grants icon', { width: 2340 }), cell('showPanel("grants")', { width: 3510 }), cell('Full grant library', { width: 3510 })] }),
          new TableRow({ children: [cell('Action Queue icon', { width: 2340 }), cell('showPanel("action")', { width: 3510 }), cell('Score >= 60, not applied', { width: 3510 })] }),
          new TableRow({ children: [cell('Pipeline icon', { width: 2340 }), cell('showPanel("pipeline")', { width: 3510 }), cell('Kanban by status', { width: 3510 })] }),
          new TableRow({ children: [cell('Contacts icon', { width: 2340 }), cell('showPanel("contacts")', { width: 3510 }), cell('Funder relationships', { width: 3510 })] }),
        ]
      }),
      spacer(2),
      pageBreak(),

      // ── 3. HOME / COMMAND CENTER ───────────────────────────
      h1('3. Home — Command Center'),
      body('The operational hub. Surfaces daily briefing, global search, and pipeline stats. First panel the user sees on every open.'),
      spacer(),
      h3('3.1 Wireframe'),
      ...wireframe([
        '+----------------------------------------------------------+',
        '|  COMMAND CENTER                           [Search bar  ] |',
        '|                                                          |',
        '|  +--------------------+   +-------------------------+   |',
        '|  | DAILY BRIEFING     |   | PIPELINE STATS          |   |',
        '|  | Last run: today    |   | New: 24  Scored: 180    |   |',
        '|  | Discovered: 12     |   | Alerted: 45 Applied: 3  |   |',
        '|  | High score: 3      |   +-------------------------+   |',
        '|  | Agents: OK         |                                  |',
        '|  +--------------------+   +-------------------------+   |',
        '|                           | SOURCE BREAKDOWN         |   |',
        '|                           | Federal: 72              |   |',
        '|                           | EdTech/DOL: 36           |   |',
        '|                           | State/Local: 93          |   |',
        '|                           | Foundation: 1            |   |',
        '|                           +-------------------------+   |',
        '+----------------------------------------------------------+',
      ]),
      spacer(),
      h3('3.2 Daily Briefing Card'),
      body('Reads most recent row from system_log (ORDER BY created_at DESC LIMIT 1). Displays:'),
      bullet('Agent name + run timestamp'),
      bullet('Grants discovered and scored (from details JSONB)'),
      bullet('High-score count (score >= 80)'),
      bullet('Agent status: success or error'),
      bullet('Empty state: onboarding message when system_log has no rows yet'),
      spacer(),
      h3('3.3 Search Bar'),
      bullet('Debounced — queries Supabase 300ms after user stops typing'),
      bullet('Dropdown shows up to 10 matching grants by title/description'),
      bullet('Clicking a result opens Grant Detail modal'),
      bullet('Clicking outside dropdown dismisses it (document click listener)'),
      spacer(2),
      pageBreak(),

      // ── 4. GRANTS PANEL ────────────────────────────────────
      h1('4. Grants Panel'),
      body('Primary browsing interface. Multi-level filtering: entity tab -> category tab -> quick filters -> budget range. Renders grant cards in a responsive grid.'),
      spacer(),
      h3('4.1 Wireframe'),
      ...wireframe([
        '+----------------------------------------------------------+',
        '|  [Noble Erne] [Walker Contractors] [Both] [All]          |',
        '|  [EdTech] [STEM] [Construction] [Federal] [Foundation]   |',
        '|                                                          |',
        '|  [High Score]  [Active]  [New This Week]                 |',
        '|  Budget: [$___] to [$___]  [Apply]                       |',
        '|                                                          |',
        '|  +------------+ +------------+ +------------+           |',
        '|  | GRANT CARD | | GRANT CARD | | GRANT CARD |           |',
        '|  | Title...   | | Title...   | | Title...   |           |',
        '|  | Agency     | | Agency     | | Agency     |           |',
        '|  | Score: 87  | | Score: 72  | | Score: 65  |           |',
        '|  | Dec 15     | | Jul 30     | | Oct 1      |           |',
        '|  | [Noble]    | | [Both]     | | [Walker]   |           |',
        '|  +------------+ +------------+ +------------+           |',
        '+----------------------------------------------------------+',
      ]),
      spacer(),
      h3('4.2 Entity Tabs'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2808, 3276, 3276],
        rows: [
          new TableRow({ children: [headerCell('Tab', 2808), headerCell('Filter', 3276), headerCell('Badge', 3276)] }),
          new TableRow({ children: [cell('Noble Erne', { width: 2808 }), cell('entity_fit contains "Noble"', { width: 3276 }), cell('None', { width: 3276 })] }),
          new TableRow({ children: [cell('Walker Contractors', { width: 2808 }), cell('entity_fit contains "Walker"', { width: 3276 }), cell('SDVOSB (gold badge)', { width: 3276 })] }),
          new TableRow({ children: [cell('Both', { width: 2808 }), cell('entity_fit = "[Both]"', { width: 3276 }), cell('None', { width: 3276 })] }),
          new TableRow({ children: [cell('All', { width: 2808 }), cell('No entity filter applied', { width: 3276 }), cell('None', { width: 3276 })] }),
        ]
      }),
      spacer(),
      h3('4.3 Quick Filters'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 7020],
        rows: [
          new TableRow({ children: [headerCell('Filter', 2340), headerCell('Logic', 7020)] }),
          new TableRow({ children: [cell('High Score', { width: 2340 }), cell('score >= 80', { width: 7020 })] }),
          new TableRow({ children: [cell('Active', { width: 2340 }), cell('deadline >= today OR deadline IS NULL', { width: 7020 })] }),
          new TableRow({ children: [cell('New This Week', { width: 2340 }), cell('created_at >= today - 7 days', { width: 7020 })] }),
          new TableRow({ children: [cell('Budget Range', { width: 2340 }), cell('amount_min >= input AND amount_max <= input — applied on button click', { width: 7020 })] }),
        ]
      }),
      spacer(),
      h3('4.4 Grant Card Fields'),
      bullet('Title — truncated at 2 lines with CSS overflow'),
      bullet('Agency name'),
      bullet('Score badge: green >= 80, amber 60-79, gray < 60'),
      bullet('Deadline: red if < 7 days, amber if < 14 days'),
      bullet('Entity fit tag: [Noble Erne], [Walker Contractors], or [Both]'),
      bullet('onClick: openGrantDetail(g.grant_id || g.id)'),
      spacer(2),
      pageBreak(),

      // ── 5. GRANT DETAIL MODAL ──────────────────────────────
      h1('5. Grant Detail Modal'),
      body('Full-detail overlay triggered by clicking any grant card. Provides read-only display and the only user-editable field in the system.'),
      spacer(),
      h3('5.1 Wireframe'),
      ...wireframe([
        '+------------------------------------------+',
        '|  [X] Close                               |',
        '|                                          |',
        '|  GRANT TITLE                     [87]   |',
        '|  Agency Name                             |',
        '|                                          |',
        '|  Deadline: Dec 15, 2026                  |',
        '|  Budget: $25,000 - $500,000              |',
        '|  Entity: [Noble Erne]                    |',
        '|  Category: EdTech                        |',
        '|  [View Original Opportunity ->]          |',
        '|                                          |',
        '|  DESCRIPTION                             |',
        '|  Full opportunity text...                |',
        '|                                          |',
        '|  AI REASONING (read-only)                |',
        '|  Claude scored this 87 because...        |',
        '|                                          |',
        '|  YOUR NOTES                              |',
        '|  +--------------------------------------+|',
        '|  |  editable textarea (user_notes)     ||',
        '|  +--------------------------------------+|',
        '|  [Save Notes]                            |',
        '|                                          |',
        '|  [Export CSV]              [Close]       |',
        '+------------------------------------------+',
      ]),
      spacer(),
      h3('5.2 DB Column Mapping'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2808, 3276, 3276],
        rows: [
          new TableRow({ children: [headerCell('UI Field', 2808), headerCell('DB Column', 3276), headerCell('Editable?', 3276)] }),
          new TableRow({ children: [cell('Title / Agency / Score', { width: 2808 }), cell('title, agency, score', { width: 3276 }), cell('No', { width: 3276 })] }),
          new TableRow({ children: [cell('Deadline', { width: 2808 }), cell('deadline', { width: 3276 }), cell('No', { width: 3276 })] }),
          new TableRow({ children: [cell('Budget', { width: 2808 }), cell('amount_min, amount_max', { width: 3276 }), cell('No', { width: 3276 })] }),
          new TableRow({ children: [cell('Entity / Category', { width: 2808 }), cell('entity_fit, category', { width: 3276 }), cell('No — AI assigned', { width: 3276 })] }),
          new TableRow({ children: [cell('Source URL', { width: 2808 }), cell('source_url', { width: 3276 }), cell('No', { width: 3276 })] }),
          new TableRow({ children: [cell('Description', { width: 2808 }), cell('description', { width: 3276 }), cell('No', { width: 3276 })] }),
          new TableRow({ children: [cell('AI Reasoning', { width: 2808 }), cell('notes', { width: 3276 }), cell('No — AI read-only', { width: 3276 })] }),
          new TableRow({ children: [cell('Your Notes', { width: 2808 }), cell('user_notes', { width: 3276 }), cell('YES — user editable', { width: 3276 })] }),
        ]
      }),
      spacer(),
      body('CSV export columns (13): title, agency, deadline, score, entity_fit, category, amount_min, amount_max, status, source, source_url, user_notes, grant_id', { italic: true }),
      spacer(2),
      pageBreak(),

      // ── 6. ACTION QUEUE ────────────────────────────────────
      h1('6. Action Queue'),
      body('Surfaces grants requiring immediate attention. High-relevance opportunities the pipeline has found but which have not yet been acted upon.'),
      spacer(),
      h3('6.1 Wireframe'),
      ...wireframe([
        '+----------------------------------------------------------+',
        '|  ACTION QUEUE                                            |',
        '|  High-priority grants not yet applied                   |',
        '|                                                          |',
        '|  Budget: [$___] to [$___]  [Apply Filter]               |',
        '|                                                          |',
        '|  # | Title               | Score | Deadline  | Entity  |',
        '|  --+---------------------+-------+-----------+---------  |',
        '|  1 | DOL Workforce Dev   | [92]  | Jun 30    | Noble   |',
        '|  2 | SBIR Phase I        | [85]  | Jul 15    | Both    |',
        '|  3 | VA Capacity Build   | [81]  | Aug 1     | Walker  |',
        '+----------------------------------------------------------+',
      ]),
      spacer(),
      body('Filter: score >= 60 AND status != "applied" AND (deadline >= today OR deadline IS NULL). Sorted by score DESC. Budget range is an additional client-side filter.'),
      spacer(2),
      pageBreak(),

      // ── 7. PIPELINE ────────────────────────────────────────
      h1('7. Pipeline View'),
      body('Organizes all grants by workflow status in four sequential stages.'),
      spacer(),
      h3('7.1 Wireframe'),
      ...wireframe([
        '+------------+  +------------+  +------------+  +------------+',
        '|    NEW     |  |   SCORED   |  |  ALERTED   |  |  APPLIED   |',
        '|            |  |            |  |            |  |            |',
        '| [Grant A]  |  | [Grant C]  |  | [Grant E]  |  | [Grant G]  |',
        '| [Grant B]  |  | [Grant D]  |  |            |  |            |',
        '|            |  |            |  |            |  |            |',
        '| 24 grants  |  | 180 grants |  | 45 grants  |  | 3 grants   |',
        '+------------+  +------------+  +------------+  +------------+',
      ]),
      spacer(),
      h3('7.2 Status Definitions'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1872, 2808, 4680],
        rows: [
          new TableRow({ children: [headerCell('Status', 1872), headerCell('Set By', 2808), headerCell('Meaning', 4680)] }),
          new TableRow({ children: [cell('new', { width: 1872 }), cell('Discovery agent (insert)', { width: 2808 }), cell('Discovered, awaiting AI scoring', { width: 4680 })] }),
          new TableRow({ children: [cell('scored', { width: 1872 }), cell('Scoring agent (Haiku)', { width: 2808 }), cell('AI score + entity_fit assigned', { width: 4680 })] }),
          new TableRow({ children: [cell('alerted', { width: 1872 }), cell('Alert agent (email sent)', { width: 2808 }), cell('High-score email notification sent', { width: 4680 })] }),
          new TableRow({ children: [cell('applied', { width: 1872 }), cell('User (manual update)', { width: 2808 }), cell('Application submitted — move to archive', { width: 4680 })] }),
        ]
      }),
      spacer(2),
      pageBreak(),

      // ── 8. FUNDER CONTACTS ─────────────────────────────────
      h1('8. Funder Contacts'),
      body('Relationship management for program officers, foundation contacts, and agency representatives. Reads from the funder_contacts Supabase table.'),
      spacer(),
      h3('8.1 Wireframe'),
      ...wireframe([
        '+----------------------------------------------------------+',
        '|  FUNDER CONTACTS                    [+ Add Contact]      |',
        '|                                                          |',
        '|  Funder Name    | Contact      | Email       | Notes    |',
        '|  ---------------+--------------+-------------+----------  |',
        '|  Lumina Found.  | Jane Smith   | j@lumina    | Call Q2  |',
        '|  DOL/ETA        | John Doe     | j@dol.gov   | Met conf |',
        '|  NIH NIDCD      | --           | --          | --       |',
        '+----------------------------------------------------------+',
      ]),
      spacer(),
      body('Prerequisite: funder_contacts table must exist in Supabase (Migration 004). If missing, panel shows "Could not find table" error. Run migration SQL in Supabase SQL Editor to resolve.', { italic: true }),
      spacer(2),
      pageBreak(),

      // ── 9. DESIGN SYSTEM ───────────────────────────────────
      h1('9. Design System'),
      spacer(),
      h3('9.1 Color Tokens (CSS Custom Properties)'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 4680],
        rows: [
          new TableRow({ children: [headerCell('Token', 2340), headerCell('Hex', 2340), headerCell('Usage', 4680)] }),
          new TableRow({ children: [cell('--bg1', { width: 2340 }), cell('#060A14', { width: 2340 }), cell('Page background (darkest)', { width: 4680 })] }),
          new TableRow({ children: [cell('--bg2', { width: 2340 }), cell('#0B0F1A', { width: 2340 }), cell('Sidebar background — MUST be in :root', { width: 4680 })] }),
          new TableRow({ children: [cell('--bg3', { width: 2340 }), cell('#0F1424', { width: 2340 }), cell('Card/panel background — MUST be in :root', { width: 4680 })] }),
          new TableRow({ children: [cell('--accent', { width: 2340 }), cell('#3B82F6', { width: 2340 }), cell('Brand blue — tabs, buttons, links', { width: 4680 })] }),
          new TableRow({ children: [cell('--green', { width: 2340 }), cell('#22C55E', { width: 2340 }), cell('High score badge, success indicators', { width: 4680 })] }),
          new TableRow({ children: [cell('--amber', { width: 2340 }), cell('#F59E0B', { width: 2340 }), cell('Mid score badge, deadline warnings', { width: 4680 })] }),
          new TableRow({ children: [cell('--red', { width: 2340 }), cell('#EF4444', { width: 2340 }), cell('Urgent deadline (< 7 days), errors', { width: 4680 })] }),
          new TableRow({ children: [cell('--text', { width: 2340 }), cell('#E2E8F0', { width: 2340 }), cell('Primary text on dark bg', { width: 4680 })] }),
          new TableRow({ children: [cell('--muted', { width: 2340 }), cell('#94A3B8', { width: 2340 }), cell('Secondary / metadata text', { width: 4680 })] }),
        ]
      }),
      spacer(),
      body('Note: --bg2 and --bg3 were missing in early deployment (Gap A), causing transparent sidebar and card backgrounds. Both must be explicitly defined in the :root CSS block.', { italic: true }),
      spacer(),
      h3('9.2 Score Badge Rules'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [headerCell('Score Range', 3120), headerCell('Badge Color', 3120), headerCell('Recommended Action', 3120)] }),
          new TableRow({ children: [cell('80 – 100', { width: 3120 }), cell('Green (#22C55E)', { width: 3120 }), cell('Priority — pursue immediately', { width: 3120 })] }),
          new TableRow({ children: [cell('60 – 79', { width: 3120 }), cell('Amber (#F59E0B)', { width: 3120 }), cell('Review — assess fit before committing', { width: 3120 })] }),
          new TableRow({ children: [cell('0 – 59', { width: 3120 }), cell('Gray (#64748B)', { width: 3120 }), cell('Low priority — monitor only', { width: 3120 })] }),
        ]
      }),
      spacer(2),
      pageBreak(),

      // ── 10. DATA FLOW ──────────────────────────────────────
      h1('10. Data Flow & State Management'),
      spacer(),
      h3('10.1 Page Load Sequence'),
      bullet('1. window.onerror registered — JS crashes display visually on-screen', 'numbers'),
      bullet('2. Supabase createClient() wrapped in try/catch with null guard', 'numbers'),
      bullet('3. renderHome() builds sidebar + initial panel structure', 'numbers'),
      bullet('4. loadData() fires immediately — no auth gate', 'numbers'),
      bullet('5. Grants, alerts, system_log fetched in parallel from Supabase', 'numbers'),
      bullet('6. UI re-renders with live data from all three tables', 'numbers'),
      bullet('7. setInterval(loadData, 300000) — auto-refresh every 5 minutes', 'numbers'),
      spacer(),
      h3('10.2 Notes Save Flow'),
      body('User edits textarea in Grant Detail -> clicks "Save Notes":'),
      bullet('saveNotes(grantId, value) called'),
      bullet('Supabase PATCH: { user_notes: value } WHERE id = grantId'),
      bullet('Local state updated: g.user_notes = value (no full reload)'),
      body('CRITICAL: notes column = AI reasoning, read-only. user_notes = user input, writable. These must never be swapped. (Was Gap B bug — fixed.)', { italic: true }),
      spacer(),
      h3('10.3 Error Handling Table'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: [
          new TableRow({ children: [headerCell('Error', 3120), headerCell('Recovery', 6240)] }),
          new TableRow({ children: [cell('Supabase CDN not loaded', { width: 3120 }), cell('Null check -> "Database unavailable" message shown', { width: 6240 })] }),
          new TableRow({ children: [cell('JS syntax error in script', { width: 3120 }), cell('window.onerror catches -> red error overlay on page', { width: 6240 })] }),
          new TableRow({ children: [cell('Table not found in DB', { width: 3120 }), cell('Supabase error string shown in panel instead of data', { width: 6240 })] }),
          new TableRow({ children: [cell('Null grant_id on card click', { width: 3120 }), cell('g.grant_id || g.id fallback prevents crash', { width: 6240 })] }),
          new TableRow({ children: [cell('Blank main panel on load', { width: 3120 }), cell('Usually cached old file — Ctrl+Shift+R hard refresh resolves', { width: 6240 })] }),
        ]
      }),
      spacer(2),
      pageBreak(),

      // ── 11. ROADMAP ────────────────────────────────────────
      h1('11. Enhancement Roadmap'),
      spacer(),
      h3('11.1 Known Limitations'),
      bullet('500-grant load limit — add pagination when pipeline exceeds this'),
      bullet('No in-UI status update — user must go to Supabase to mark "applied"'),
      bullet('Single-grant CSV export only — no bulk export from filtered list'),
      bullet('funder_contacts table requires manual Supabase migration'),
      bullet('No offline mode — internet required for all data'),
      spacer(),
      h3('11.2 Prioritized Enhancements'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1872, 3744, 3744],
        rows: [
          new TableRow({ children: [headerCell('Priority', 1872), headerCell('Feature', 3744), headerCell('Notes', 3744)] }),
          new TableRow({ children: [cell('High', { width: 1872 }), cell('"Mark Applied" button in detail modal', { width: 3744 }), cell('Eliminates need for Supabase dashboard', { width: 3744 })] }),
          new TableRow({ children: [cell('High', { width: 1872 }), cell('Bulk CSV export from filtered grant list', { width: 3744 }), cell('One-click export of current filter results', { width: 3744 })] }),
          new TableRow({ children: [cell('Medium', { width: 1872 }), cell('Pagination (100/page)', { width: 3744 }), cell('Remove 500-grant ceiling', { width: 3744 })] }),
          new TableRow({ children: [cell('Medium', { width: 1872 }), cell('Grant archiving', { width: 3744 }), cell('Hide expired/irrelevant grants from default views', { width: 3744 })] }),
          new TableRow({ children: [cell('Low', { width: 1872 }), cell('Netlify deployment', { width: 3744 }), cell('Web-hosted version — needs env var security rework', { width: 3744 })] }),
          new TableRow({ children: [cell('Low', { width: 1872 }), cell('Proposal agent trigger from dashboard', { width: 3744 }), cell('Button in modal -> runs grant-proposal-agent.js for that grant', { width: 3744 })] }),
        ]
      }),
      spacer(2),
      pageBreak(),

      // ── CLOSING ────────────────────────────────────────────
      divider(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: 'GRANT PRIME', bold: true, size: 32, color: ACCENT, font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: 'Noble Erne, LLC  |  Confidential  |  May 2026', size: 20, color: DKGRAY, font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'Internal use only. Do not distribute.', size: 18, color: DKGRAY, font: 'Arial', italics: true })]
      }),
    ]
  }]
});

// ── Write output ───────────────────────────────────────────────
const outPath = process.argv[2] || 'GRANT_PRIME_UI_Analysis.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log('Written: ' + outPath);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
