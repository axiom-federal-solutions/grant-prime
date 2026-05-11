/**
 * GRANT PRIME — UI Analysis Document Generator
 * Noble Erne, LLC
 *
 * Run: node generate-ui-analysis.js
 * Output: grant-prime-ui-analysis.docx
 *
 * Requires: npm install docx
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, Header, Footer, ExternalHyperlink
} from 'docx';
import { writeFileSync, mkdirSync } from 'fs';
import { createCanvas } from 'canvas'; // npm install canvas

// ─────────────────────────────────────────────────────────────
// COLORS & HELPERS
// ─────────────────────────────────────────────────────────────
const C = {
  dark:    '#06080F', card:  '#0B0F1A', border: '#1E2640',
  cyan:    '#00E5FF', green: '#34D399', violet: '#A78BFA',
  gold:    '#E9C46A', red:   '#F87171', amber:  '#F59E0B',
  t1:      '#EDF0F7', t2:    '#8B95AB', t3:     '#4D5669',
  white:   '#FFFFFF',
};

function hex(h) {
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return [r,g,b];
}
function rgb(h) { const [r,g,b]=hex(h); return `rgb(${r},${g},${b})`; }

function makeCanvas(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  return { canvas, ctx };
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);   ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);     ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);       ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
  if (fill)  { ctx.fillStyle   = fill;   ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function pill(ctx, x, y, text, bg, fg, fontSize=10) {
  ctx.font = `bold ${fontSize}px Arial`;
  const tw = ctx.measureText(text).width;
  roundRect(ctx, x, y, tw+16, fontSize+8, 4, bg);
  ctx.fillStyle = fg; ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillText(text, x+8, y+fontSize+1);
}

function scoreBar(ctx, x, y, w, score, maxScore=100) {
  const pct = score / maxScore;
  roundRect(ctx, x, y, w, 8, 4, C.border);
  const color = score>=80 ? C.green : score>=65 ? C.gold : C.amber;
  roundRect(ctx, x, y, w * pct, 8, 4, color);
}

// ─────────────────────────────────────────────────────────────
// UI MOCKUP 1 — Current GRANT PRIME Dashboard (for comparison)
// ─────────────────────────────────────────────────────────────
function mockup1_current() {
  const W=1100, H=680;
  const { canvas, ctx } = makeCanvas(W, H);

  // Background
  ctx.fillStyle = C.dark; ctx.fillRect(0, 0, W, H);

  // Sidebar
  roundRect(ctx, 0, 0, 200, H, 0, '#080B14');
  ctx.fillStyle = C.t3; ctx.font = '9px Arial';
  ctx.fillText('GRANT PRIME', 16, 30);

  // Sidebar items
  const sideItems = [
    ['🏠 Command Center', true],
    ['🚨 Action Queue', false],
    ['💼 Ed / Tech', false],
    ['🔬 STEM', false],
    ['🏗️ Construction', false],
    ['📋 All Grants', false],
    ['🏛️ Federal', false],
    ['📚 EdTech/DOL', false],
    ['🗺️ State/Local', false],
    ['🏦 Foundation', false],
    ['⏰ Deadlines', false],
    ['📈 Performance', false],
    ['⚙️ Agents', false],
  ];
  sideItems.forEach(([label, active], i) => {
    const y = 55 + i * 44;
    if (active) {
      roundRect(ctx, 8, y-14, 184, 36, 6, 'rgba(52,211,153,0.1)');
      ctx.strokeStyle = C.green; ctx.lineWidth = 1;
      roundRect(ctx, 8, y-14, 184, 36, 6, null, C.green);
    }
    ctx.fillStyle = active ? C.t1 : C.t3;
    ctx.font = `${active?'600':'400'} 11px Arial`;
    ctx.fillText(label, 20, y+6);
  });

  // Main content area
  const MX = 215, MY = 20, MW = W - MX - 15;

  // Header
  ctx.fillStyle = C.t1; ctx.font = 'bold 18px Arial';
  ctx.fillText('Command Center', MX, MY+18);
  ctx.fillStyle = C.t2; ctx.font = '11px Arial';
  ctx.fillText('GRANT PRIME · Noble Erne, LLC & Walker Contractors LLC', MX, MY+36);

  // Briefing card
  roundRect(ctx, MX, MY+50, MW, 90, 8, C.card, C.border);
  ctx.fillStyle = C.t1; ctx.font = 'bold 13px Arial';
  ctx.fillText('📋 Today\'s Briefing', MX+14, MY+72);
  ctx.fillStyle = C.green; ctx.font = 'bold 10px Arial';
  ctx.fillText('✅ HEALTHY', MX+MW-80, MY+72);

  ctx.fillStyle = C.t3; ctx.font = 'bold 9px Arial';
  ctx.fillText('AGENT RUNS', MX+14, MY+94);
  ctx.fillStyle = C.cyan; ctx.font = 'bold 11px Arial';
  ctx.fillText('Discovery  +47', MX+14, MY+110);
  ctx.fillStyle = C.violet;
  ctx.fillText('Scoring    +47', MX+14, MY+126);

  ctx.fillStyle = C.t3; ctx.font = 'bold 9px Arial';
  ctx.fillText('CATEGORY BREAKDOWN', MX+MW/2, MY+94);
  [['💼 Ed/Tech', C.cyan, 22], ['🔬 STEM', C.violet, 8], ['🏗️ Construction', C.green, 12], ['🏦 Foundation', C.gold, 5]].forEach(([cat, color, n], i) => {
    ctx.fillStyle = color; ctx.font = '10px Arial';
    ctx.fillText(cat, MX+MW/2, MY+110+i*14);
    ctx.fillStyle = C.t1; ctx.font = 'bold 10px Arial';
    ctx.fillText(n, MX+MW-30, MY+110+i*14);
  });

  // Search bar
  roundRect(ctx, MX, MY+152, MW, 36, 8, C.card, C.border);
  ctx.fillStyle = C.t3; ctx.font = '12px Arial';
  ctx.fillText('🔍  Search all grants — title, funder, NAICS, category, keyword…', MX+12, MY+175);

  // KPI row
  const kpis = [['287','Total Grants',C.t1],['43','Score ≥80',C.green],['7','Closing ≤14d',C.red],['3','Applied',C.gold],['$2.1M','Pipeline',C.violet]];
  const kw = (MW-16) / 5;
  kpis.forEach(([val,lbl,color], i) => {
    const kx = MX + i*kw + 8;
    roundRect(ctx, kx, MY+200, kw-8, 58, 6, C.card, C.border);
    ctx.fillStyle = color; ctx.font = 'bold 18px Arial';
    ctx.fillText(val, kx+12, MY+226);
    ctx.fillStyle = C.t3; ctx.font = '9px Arial';
    ctx.fillText(lbl, kx+12, MY+244);
  });

  // Grant list header
  ctx.fillStyle = C.t3; ctx.font = 'bold 9px Arial';
  ['GRANT TITLE','SCORE','AMOUNT','DEADLINE','STATUS'].forEach((h,i) => {
    ctx.fillText(h, MX + [0,390,460,540,620][i], MY+280);
  });

  // Grant rows
  const grants = [
    ['SBIR Phase II: Workforce Dev Technology','94','$300K','Jun 15','scored',C.green],
    ['VA Construction Renovation — Dallas TX','91','$850K','Jun 8','scored',C.green],
    ['NSF STEM Education Innovation Grant','87','$250K','Jul 2','scored',C.green],
    ['DOL Employment & Training Admin','83','$150K','Jun 22','applied',C.gold],
    ['Gates Foundation EdTech Initiative','76','$75K','Jul 18','scored',C.amber],
    ['HHS Community Health Worker Training','71','$120K','Aug 1','scored',C.amber],
  ];
  grants.forEach(([title, score, amt, dl, status, scoreColor], i) => {
    const gy = MY + 294 + i * 38;
    roundRect(ctx, MX, gy, MW, 34, 5, i%2===0?'rgba(255,255,255,0.02)':C.dark, C.border);
    ctx.fillStyle = C.t1; ctx.font = '11px Arial';
    ctx.fillText(title.slice(0,52), MX+8, gy+20);
    ctx.fillStyle = scoreColor; ctx.font = 'bold 14px Arial';
    ctx.fillText(score, MX+393, gy+20);
    ctx.fillStyle = C.t2; ctx.font = '11px Arial';
    ctx.fillText(amt, MX+455, gy+20);
    ctx.fillText(dl, MX+540, gy+20);
    const statusColors = {scored:C.cyan, applied:C.gold, new:C.t3};
    pill(ctx, MX+618, gy+8, status, 'rgba(52,211,153,0.1)', statusColors[status]||C.cyan, 9);
  });

  // Label
  ctx.fillStyle = C.t3; ctx.font = 'italic 10px Arial';
  ctx.fillText('Current GRANT PRIME Dashboard', W/2-80, H-8);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// UI MOCKUP 2 — Linear-style Pipeline View (recommended)
// ─────────────────────────────────────────────────────────────
function mockup2_linear_pipeline() {
  const W=1100, H=680;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#111318'; ctx.fillRect(0, 0, W, H);

  // Top nav bar
  ctx.fillStyle = '#1A1D24'; ctx.fillRect(0, 0, W, 46);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 13px Arial';
  ctx.fillText('Grant Pipeline', 16, 28);
  ['Backlog','Active','Scoring Queue','Deadlines','Wins'].forEach((tab,i) => {
    const active = i===1;
    const tx = 140 + i * 110;
    if (active) {
      ctx.fillStyle = '#2A2D36'; roundRect(ctx, tx-8, 8, 102, 30, 6, '#2A2D36');
    }
    ctx.fillStyle = active ? '#FFFFFF' : '#8B95AB';
    ctx.font = `${active?'600':'400'} 12px Arial`;
    ctx.fillText(tab, tx, 28);
  });

  // Right side controls
  ['⌘K  Search', '▦ Group', '⊞ Filter', '+ New Grant'].forEach((btn,i) => {
    const bx = W - 340 + i*85;
    roundRect(ctx, bx, 10, 76, 26, 5, i===3?'#34D399':'#2A2D36');
    ctx.fillStyle = i===3?'#06080F':'#8B95AB';
    ctx.font = '11px Arial';
    ctx.fillText(btn, bx+8, 27);
  });

  // Left sidebar — nav
  ctx.fillStyle = '#141619'; ctx.fillRect(0, 46, 220, H-46);
  const navSections = [
    ['MY WORK', [['🚨 Urgent Queue','3'],['📋 Assigned to Me','8'],['📌 Saved Filters','']]],
    ['PIPELINE', [['All Grants','287'],['Score ≥80','43'],['Applied','12'],['Won / Closed','5']]],
    ['CATEGORY', [['💼 Ed / Tech','142'],['🔬 STEM','61'],['🏗️ Construction','68'],['🏦 Foundation','16']]],
  ];
  let ny = 66;
  navSections.forEach(([header, items]) => {
    ctx.fillStyle = '#4D5669'; ctx.font = 'bold 9px Arial';
    ctx.fillText(header, 14, ny); ny+=16;
    items.forEach(([label, count]) => {
      roundRect(ctx, 8, ny-13, 204, 24, 4, label==='Score ≥80'?'rgba(52,211,153,0.1)':'transparent');
      ctx.fillStyle = label==='Score ≥80'?'#34D399':'#8B95AB';
      ctx.font = `${label==='Score ≥80'?'600':'400'} 12px Arial`;
      ctx.fillText(label, 18, ny+3);
      if (count) {
        ctx.fillStyle = '#4D5669'; ctx.font = '10px Arial';
        ctx.fillText(count, 200, ny+3);
      }
      ny+=26;
    });
    ny+=8;
  });

  // Main area — issue list style
  const MX=228, MY=56;

  // Sub-header with sort
  ctx.fillStyle = '#8B95AB'; ctx.font = '11px Arial';
  ctx.fillText('287 grants  ·  sorted by score  ·  grouped by status', MX+8, MY+20);

  // Column headers
  const cols = ['','GRANT TITLE & FUNDER','SCORE','AMOUNT','DEADLINE','DAYS','STATUS','ENTITY'];
  const cw   = [24, 330, 60, 90, 100, 55, 80, 90];
  let cx2 = MX;
  cols.forEach((h,i) => {
    ctx.fillStyle = '#4D5669'; ctx.font = 'bold 9px Arial';
    ctx.fillText(h, cx2+6, MY+40);
    cx2 += cw[i];
  });

  // Section divider
  ctx.fillStyle = '#2A2D36'; ctx.fillRect(MX, MY+46, W-MX-8, 1);
  ctx.fillStyle = '#F87171'; ctx.font = 'bold 10px Arial';
  ctx.fillText('⚡ URGENT — Closing in ≤14 days  ·  Score ≥80', MX+8, MY+60);
  ctx.fillStyle = '#4D5669'; ctx.fillText('6 grants', MX+350, MY+60);

  // Grant rows
  const rows = [
    ['','VA Construction Renovation — SDVOSB Set-Aside','91','$850K','Jun 8','3d','scored','Walker',C.green,'#F87171'],
    ['','SBIR Phase II: Workforce Tech Platform','94','$300K','Jun 12','7d','scored','Noble Erne',C.green,'#F87171'],
    ['','NSF CS for All — STEM Workforce Initiative','87','$250K','Jun 15','10d','scored','Noble Erne',C.violet,'#F59E0B'],
    ['','DOL Employment Training (Applied)','83','$150K','Jun 18','13d','applied','Noble Erne',C.green,'#F59E0B'],
    ['','Gates Foundation EdTech Innovation','76','$75K','Jun 22','17d','scored','Noble Erne',C.gold,'#34D399'],
    ['','HHS Community Workforce Dev Program','71','$120K','Jul 1','25d','scored','Noble Erne',C.amber,'#34D399'],
  ];

  rows.forEach(([check, title, score, amt, dl, days, status, entity, scoreColor, daysColor], i) => {
    const ry = MY + 72 + i * 40;
    ctx.fillStyle = i%2===0?'rgba(255,255,255,0.015)':'transparent';
    ctx.fillRect(MX, ry-2, W-MX-8, 38);

    // Hover-like border on first
    if (i===0) { ctx.strokeStyle='rgba(52,211,153,0.3)'; ctx.lineWidth=1; ctx.strokeRect(MX, ry-2, W-MX-8, 38); }

    // Checkbox
    roundRect(ctx, MX+6, ry+8, 14, 14, 2, 'transparent', '#2A2D36');

    // Title
    ctx.fillStyle = '#EDF0F7'; ctx.font = '12px Arial';
    ctx.fillText(title.slice(0,52), MX+32, ry+21);
    if (entity==='Walker') {
      pill(ctx, MX+32+ctx.measureText(title.slice(0,52)).width+8, ry+11, 'SDVOSB', 'rgba(52,211,153,0.12)', C.green, 8);
    }

    // Score
    let cc = MX+cw[0]+cw[1];
    ctx.fillStyle = scoreColor; ctx.font = 'bold 14px Arial';
    ctx.fillText(score, cc+6, ry+22);

    // Amount
    cc += cw[2];
    ctx.fillStyle = '#8B95AB'; ctx.font = '11px Arial';
    ctx.fillText(amt, cc+6, ry+22);

    // Deadline
    cc += cw[3];
    ctx.fillText(dl, cc+6, ry+22);

    // Days
    cc += cw[4];
    ctx.fillStyle = daysColor; ctx.font = 'bold 12px Arial';
    ctx.fillText(days, cc+6, ry+22);

    // Status
    cc += cw[5];
    const statusBg = {scored:'rgba(0,229,255,0.08)', applied:'rgba(233,196,106,0.1)', new:'rgba(255,255,255,0.05)'};
    pill(ctx, cc+4, ry+10, status, statusBg[status]||'transparent', status==='applied'?C.gold:C.cyan, 9);

    // Entity
    cc += cw[6];
    ctx.fillStyle = entity==='Walker'?C.green:C.cyan;
    ctx.font = '10px Arial';
    ctx.fillText(entity, cc+4, ry+22);
  });

  // Score section separator
  const sep2y = MY+72+6*40+8;
  ctx.fillStyle = '#2A2D36'; ctx.fillRect(MX, sep2y, W-MX-8, 1);
  ctx.fillStyle = '#34D399'; ctx.font = 'bold 10px Arial';
  ctx.fillText('✅ PIPELINE — Score ≥65  ·  No deadline pressure', MX+8, sep2y+16);

  // Keyboard hint
  ctx.fillStyle = '#2A2D36'; roundRect(ctx, W-120, H-30, 110, 22, 4, '#1A1D24', '#2A2D36');
  ctx.fillStyle = '#4D5669'; ctx.font = '9px Arial';
  ctx.fillText('⌘K  Global search  ·  G  Go to', W-116, H-15);

  ctx.fillStyle = '#4D5669'; ctx.font = 'italic 10px Arial';
  ctx.fillText('UI Reference 1: Linear-style pipeline list — keyboard-driven, dense, sortable', W/2-200, H-6);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// UI MOCKUP 3 — Kanban Board (Stage-Based Pipeline)
// ─────────────────────────────────────────────────────────────
function mockup3_kanban() {
  const W=1100, H=680;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#0D1117'; ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#161B22'; ctx.fillRect(0, 0, W, 50);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px Arial';
  ctx.fillText('Grant Pipeline Board', 20, 30);
  ['Board','List','Calendar','Timeline'].forEach((v,i) => {
    const active = i===0;
    roundRect(ctx, 200+i*90, 12, 80, 26, 5, active?'#21262D':'transparent');
    ctx.fillStyle = active?'#FFFFFF':'#8B1D3F';
    ctx.fillStyle = active?'#FFFFFF':'#8B95AB';
    ctx.font = `${active?'600':'400'} 12px Arial`;
    ctx.fillText(v, 220+i*90, 29);
  });

  const cols = [
    {title:'🆕 Discovered', color:'#4D5669', count:47, grants:[
      {title:'NSF STEM After School',score:72,amt:'$80K',dl:'Aug 15',entity:'Noble Erne'},
      {title:'DOE Clean Energy Training',score:68,amt:'$200K',dl:'Sep 1',entity:'Noble Erne'},
      {title:'HUD Community Dev Block',score:65,amt:'$500K',dl:'Aug 22',entity:'Walker'},
      {title:'Kresge Foundation Arts Ed',score:61,amt:'$50K',dl:'Sep 10',entity:'Noble Erne'},
    ]},
    {title:'⭐ Scored ≥80', color:'#00E5FF', count:43, grants:[
      {title:'VA Construction — Dallas',score:91,amt:'$850K',dl:'Jun 8',entity:'Walker'},
      {title:'SBIR Phase II Workforce',score:94,amt:'$300K',dl:'Jun 12',entity:'Noble Erne'},
      {title:'NSF CS for All',score:87,amt:'$250K',dl:'Jun 15',entity:'Noble Erne'},
      {title:'DOL Employment Training',score:83,amt:'$150K',dl:'Jun 18',entity:'Noble Erne'},
    ]},
    {title:'📝 Applied', color:'#E9C46A', count:12, grants:[
      {title:'DOD Facilities Renovation',score:88,amt:'$1.2M',dl:'Submitted',entity:'Walker'},
      {title:'Gates Foundation EdTech',score:82,amt:'$75K',dl:'Submitted',entity:'Noble Erne'},
      {title:'SBA SDVOSB Growth Fund',score:79,amt:'$250K',dl:'Submitted',entity:'Walker'},
    ]},
    {title:'🏆 Won / Funded', color:'#34D399', count:5, grants:[
      {title:'HHS Workforce Initiative',score:86,amt:'$120K',dl:'Funded',entity:'Noble Erne'},
      {title:'VA Renovation Contract',score:90,amt:'$680K',dl:'Funded',entity:'Walker'},
    ]},
  ];

  const colW = (W - 30) / 4 - 8;

  cols.forEach((col, ci) => {
    const cx = 15 + ci * (colW + 10);
    // Column header
    ctx.fillStyle = '#161B22'; roundRect(ctx, cx, 58, colW, H-66, 8, '#161B22');
    roundRect(ctx, cx, 58, colW, 36, 8, '#21262D');
    ctx.fillStyle = col.color; ctx.font = 'bold 12px Arial';
    ctx.fillText(col.title, cx+10, 80);
    roundRect(ctx, cx+colW-36, 66, 28, 18, 9, '#21262D');
    ctx.fillStyle = '#8B95AB'; ctx.font = 'bold 10px Arial';
    ctx.fillText(col.count, cx+colW-26, 79);

    // Cards
    col.grants.forEach((g, gi) => {
      const gy = 102 + gi * 108;
      roundRect(ctx, cx+6, gy, colW-12, 98, 8, '#0D1117', '#21262D');

      // Score badge
      const scoreColor = g.score>=80?'#34D399':g.score>=65?'#E9C46A':'#F59E0B';
      roundRect(ctx, cx+colW-50, gy+8, 38, 22, 4, scoreColor+'20');
      ctx.fillStyle = scoreColor; ctx.font = 'bold 13px Arial';
      ctx.fillText(g.score, cx+colW-38, gy+24);

      // Title
      ctx.fillStyle = '#EDF0F7'; ctx.font = '600 11px Arial';
      const words = g.title.split(' ');
      let line = '', lineY = gy+26;
      words.forEach(w => {
        const test = line + w + ' ';
        if (ctx.measureText(test).width > colW-60 && line) {
          ctx.fillText(line.trim(), cx+10, lineY); line=w+' '; lineY+=14;
        } else { line = test; }
      });
      if (line) ctx.fillText(line.trim(), cx+10, lineY);

      // Amount & deadline
      ctx.fillStyle = '#8B95AB'; ctx.font = '10px Arial';
      ctx.fillText(g.amt, cx+10, gy+68);
      ctx.fillStyle = g.dl.startsWith('Jun')||g.dl==='Jun 8'?'#F87171':'#8B95AB';
      ctx.font = '10px Arial';
      ctx.fillText('📅 '+g.dl, cx+10, gy+82);

      // Entity tag
      const ec = g.entity==='Walker'?'#34D399':'#00E5FF';
      pill(ctx, cx+colW-80, gy+72, g.entity==='Walker'?'SDVOSB':'Ed/Tech', ec+'18', ec, 8);
    });

    // Add card button
    ctx.fillStyle = '#21262D'; ctx.font = '11px Arial';
    ctx.fillText('+ Add grant', cx+10, H-14);
  });

  ctx.fillStyle = '#4D5669'; ctx.font = 'italic 10px Arial';
  ctx.fillText('UI Reference 2: Kanban board — visualize grant stages as drag-and-drop columns', W/2-220, H-2);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// UI MOCKUP 4 — Command Palette (⌘K Spotlight Search)
// ─────────────────────────────────────────────────────────────
function mockup4_command_palette() {
  const W=1100, H=680;
  const { canvas, ctx } = makeCanvas(W, H);

  // Blurred dark background
  ctx.fillStyle = '#06080F'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);

  // Faint dashboard behind (just shapes)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(30, 30, 180, H-60); // sidebar
  ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(220, 30, W-250, H-60); // content

  // Command palette modal
  const pw=680, ph=460, px=(W-pw)/2, py=(H-ph)/2-20;
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 60;
  roundRect(ctx, px, py, pw, ph, 12, '#12161F');
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#2A3040'; ctx.lineWidth=1;
  roundRect(ctx, px, py, pw, ph, 12, null, '#2A3040');

  // Search input
  roundRect(ctx, px, py, pw, 52, 12, '#1A2030');
  // Bottom of input box
  roundRect(ctx, px, py+52, pw, 4, 0, '#12161F');
  ctx.fillStyle = '#00E5FF'; ctx.font = '15px Arial';
  ctx.fillText('🔍', px+16, py+33);
  ctx.fillStyle = '#EDF0F7'; ctx.font = '600 15px Arial';
  ctx.fillText('workforce development training', px+44, py+33);
  // Cursor
  ctx.fillStyle = '#00E5FF'; ctx.fillRect(px+44+ctx.measureText('workforce development training').width+2, py+16, 2, 22);

  // Result sections
  const sections = [
    {label:'TOP GRANTS — 6 results', items:[
      {icon:'⭐',title:'DOL Workforce Innovation — ETA Grant',sub:'Score 91 · $200K · Deadline Jun 22 · Noble Erne',color:'#34D399'},
      {icon:'⭐',title:'SBIR Phase II: Workforce Technology Platform',sub:'Score 94 · $300K · Deadline Jun 12 · Noble Erne',color:'#34D399'},
      {icon:'📄',title:'HHS Community Health Worker Training Program',sub:'Score 71 · $120K · Deadline Aug 1 · Noble Erne',color:'#8B95AB'},
    ]},
    {label:'QUICK ACTIONS', items:[
      {icon:'⚡',title:'Open Action Queue (3 urgent)',sub:'Score ≥80, Deadline ≤14 days',color:'#F87171'},
      {icon:'▶',title:'Trigger Discovery Agent on GitHub',sub:'github.com/axiom-federal-solutions/grant-prime/actions',color:'#8B95AB'},
      {icon:'📋',title:'Draft proposal for VA Construction Grant',sub:'Score 91 · Walker Contractors — SDVOSB',color:'#8B95AB'},
    ]},
  ];

  let sy = py + 62;
  sections.forEach(sec => {
    ctx.fillStyle = '#4D5669'; ctx.font = 'bold 9px Arial';
    ctx.fillText(sec.label, px+16, sy+16); sy+=24;
    sec.items.forEach((item, ii) => {
      const active = ii===0 && sec===sections[0];
      if (active) { roundRect(ctx, px+6, sy-2, pw-12, 42, 6, 'rgba(0,229,255,0.06)', 'rgba(0,229,255,0.2)'); }
      ctx.fillStyle = item.color; ctx.font = '16px Arial';
      ctx.fillText(item.icon, px+16, sy+24);
      ctx.fillStyle = active?'#FFFFFF':'#C9D1E0'; ctx.font = `${active?'600':'400'} 13px Arial`;
      ctx.fillText(item.title, px+44, sy+20);
      ctx.fillStyle = '#4D5669'; ctx.font = '11px Arial';
      ctx.fillText(item.sub, px+44, sy+34);
      if (active) {
        roundRect(ctx, px+pw-70, sy+6, 54, 20, 4, '#1A2030');
        ctx.fillStyle='#4D5669'; ctx.font='9px Arial';
        ctx.fillText('↵  Open', px+pw-62, sy+20);
      }
      sy+=46;
    });
    sy+=6;
  });

  // Footer
  ctx.fillStyle = '#1E2640'; ctx.fillRect(px, py+ph-36, pw, 36);
  roundRect(ctx, px, py+ph-36, pw, 36, 12, '#1E2640');
  const footerItems = ['↑↓ Navigate','↵ Open','⇥ Quick Look','Esc Close','⌘P  All Actions'];
  footerItems.forEach((f,i) => {
    ctx.fillStyle = '#4D5669'; ctx.font = '9px Arial';
    ctx.fillText(f, px+16+i*130, py+ph-16);
  });

  ctx.fillStyle = '#4D5669'; ctx.font = 'italic 10px Arial';
  ctx.fillText('UI Reference 3: ⌘K Command palette — instant access to any grant or action, zero-click depth', W/2-260, H-8);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// UI MOCKUP 5 — Calendar Deadline View
// ─────────────────────────────────────────────────────────────
function mockup5_calendar() {
  const W=1100, H=680;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#0A0D14'; ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#12161F'; ctx.fillRect(0, 0, W, 50);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 15px Arial';
  ctx.fillText('Deadline Calendar', 20, 30);
  ctx.fillStyle = '#8B95AB'; ctx.font = '12px Arial';
  ctx.fillText('June 2025', 160, 30);
  ['◀','▶'].forEach((a,i)=>{ ctx.fillStyle='#4D5669'; ctx.fillText(a, 140+i*32, 30); });

  ['Month','Week','⚡ Agenda'].forEach((v,i) => {
    roundRect(ctx, W-260+i*84, 12, 76, 26, 5, i===2?'rgba(0,229,255,0.1)':'transparent');
    ctx.fillStyle = i===2?'#00E5FF':'#8B95AB'; ctx.font=`${i===2?'600':'400'} 12px Arial`;
    ctx.fillText(v, W-248+i*84, 29);
  });

  // Days header
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const cw2 = (W-20)/7, ch=90;
  days.forEach((d,i) => {
    ctx.fillStyle = '#4D5669'; ctx.font = 'bold 9px Arial';
    ctx.fillText(d, 14+i*cw2+cw2/2-12, 66);
  });

  // Calendar grid — June 2025 starts Sunday
  const events = {
    8:  [{title:'VA Construction',color:'#34D399',score:91,amt:'$850K',entity:'SDVOSB'}],
    12: [{title:'SBIR Phase II',color:'#F87171',score:94,amt:'$300K',entity:'Noble Erne'}],
    15: [{title:'NSF CS for All',color:'#A78BFA',score:87,amt:'$250K',entity:'Noble Erne'}],
    18: [{title:'DOL Employment',color:'#F59E0B',score:83,amt:'$150K',entity:'Noble Erne'}],
    20: [{title:'HHS Workforce',color:'#8B95AB',score:71,amt:'$120K',entity:'Noble Erne'}],
    22: [{title:'Gates EdTech',color:'#E9C46A',score:76,amt:'$75K',entity:'Noble Erne'},{title:'DOE Training',color:'#8B95AB',score:68,amt:'$200K',entity:'Noble Erne'}],
    30: [{title:'Kresge Foundation',color:'#8B95AB',score:61,amt:'$50K',entity:'Noble Erne'}],
  };

  for (let week=0; week<5; week++) {
    for (let dow=0; dow<7; dow++) {
      const day = week*7 + dow - 0; // June 1 = Sunday (col 0)
      const dn = day + 1;
      const cx3 = 10 + dow*cw2;
      const cy3 = 72 + week*ch;
      const isToday = dn===10;
      const hasEvent = events[dn];

      roundRect(ctx, cx3, cy3, cw2-4, ch-4, 6,
        isToday?'rgba(0,229,255,0.06)': hasEvent?'rgba(255,255,255,0.02)':'transparent',
        isToday?'rgba(0,229,255,0.3)':'#1E2640');

      if (dn>=1 && dn<=30) {
        if (isToday) {
          roundRect(ctx, cx3+8, cy3+6, 22, 22, 11, '#00E5FF');
          ctx.fillStyle = '#000'; ctx.font = 'bold 11px Arial';
          ctx.fillText(dn, cx3+14, cy3+21);
        } else {
          ctx.fillStyle = hasEvent?'#EDF0F7':'#4D5669';
          ctx.font = `${hasEvent?'600':'400'} 11px Arial`;
          ctx.fillText(dn, cx3+10, cy3+20);
        }

        if (hasEvent) {
          hasEvent.slice(0,2).forEach((ev,ei) => {
            roundRect(ctx, cx3+4, cy3+28+ei*28, cw2-12, 24, 4, ev.color+'18');
            ctx.fillStyle = ev.color; ctx.font = 'bold 9px Arial';
            ctx.fillText(ev.score, cx3+8, cy3+40+ei*28);
            ctx.fillStyle = '#C9D1E0'; ctx.font = '9px Arial';
            ctx.fillText(ev.title.slice(0,16), cx3+28, cy3+40+ei*28);
            ctx.fillStyle = ev.color+'99'; ctx.font = '8px Arial';
            ctx.fillText(ev.amt, cx3+8, cy3+52+ei*28);
          });
          if (hasEvent.length>2) {
            ctx.fillStyle='#4D5669'; ctx.font='8px Arial';
            ctx.fillText(`+${hasEvent.length-2} more`, cx3+4, cy3+ch-10);
          }
        }
      }
    }
  }

  // Right panel — upcoming deadlines
  ctx.fillStyle = '#12161F'; ctx.fillRect(W-220, 50, 220, H-50);
  ctx.strokeStyle = '#1E2640'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(W-220, 50); ctx.lineTo(W-220, H); ctx.stroke();

  ctx.fillStyle = '#EDF0F7'; ctx.font = 'bold 12px Arial';
  ctx.fillText('Upcoming Deadlines', W-212, 78);
  ctx.fillStyle = '#4D5669'; ctx.font = '9px Arial';
  ctx.fillText('Next 30 days', W-212, 94);

  const upcoming = [
    {days:3,title:'VA Construction',amt:'$850K',color:'#F87171',score:91},
    {days:7,title:'SBIR Phase II',amt:'$300K',color:'#F59E0B',score:94},
    {days:10,title:'NSF CS for All',amt:'$250K',color:'#A78BFA',score:87},
    {days:13,title:'DOL Employment',amt:'$150K',color:'#F59E0B',score:83},
    {days:25,title:'Gates EdTech',amt:'$75K',color:'#34D399',score:76},
  ];
  upcoming.forEach((u,i) => {
    const uy = 108+i*58;
    roundRect(ctx, W-214, uy, 202, 50, 6, 'rgba(255,255,255,0.02)', '#1E2640');
    roundRect(ctx, W-214, uy, 46, 50, 6, u.color+'15');
    ctx.fillStyle = u.color; ctx.font = 'bold 16px Arial';
    ctx.fillText(u.days+'d', W-206, uy+22);
    ctx.fillStyle = '#4D5669'; ctx.font = '8px Arial';
    ctx.fillText('left', W-206, uy+34);
    ctx.fillStyle = '#C9D1E0'; ctx.font = '600 11px Arial';
    ctx.fillText(u.title, W-160, uy+20);
    ctx.fillStyle = u.color; ctx.font = 'bold 11px Arial';
    ctx.fillText(u.score, W-60, uy+20);
    ctx.fillStyle = '#8B95AB'; ctx.font = '10px Arial';
    ctx.fillText(u.amt, W-160, uy+36);
  });

  ctx.fillStyle = '#4D5669'; ctx.font = 'italic 10px Arial';
  ctx.fillText('UI Reference 4: Calendar deadline view — see all closing dates in context, never miss a window', W/2-260, H-4);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// UI MOCKUP 6 — Airtable-style Grid with Multi-View Tabs
// ─────────────────────────────────────────────────────────────
function mockup6_grid() {
  const W=1100, H=680;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#FAFBFC'; ctx.fillRect(0, 0, W, H);

  // Top nav
  ctx.fillStyle = '#1F2D3D'; ctx.fillRect(0,0,W,44);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 13px Arial';
  ctx.fillText('🏛 GRANT PRIME', 16, 26);
  ctx.fillStyle = '#FFFFFF99'; ctx.font = '11px Arial';
  ctx.fillText('Noble Erne & Walker Contractors', 145, 26);

  // Toolbar
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,44,W,36);
  ctx.strokeStyle = '#E5E8EC'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,80); ctx.lineTo(W,80); ctx.stroke();

  const tools = ['☰ Views','🔍 Filter','↕ Sort','⊞ Group','→ Share','+ New Grant'];
  tools.forEach((t,i) => {
    const active = i===5;
    roundRect(ctx, 10+i*105, 50, 96, 24, 4, active?'#166EE1':'transparent', active?'#166EE1':'#D5DAE0');
    ctx.fillStyle = active?'#FFFFFF':'#333F51'; ctx.font = `${active?'600':'400'} 11px Arial`;
    ctx.fillText(t, 18+i*105, 66);
  });

  // View switcher tabs
  const views = ['📋 Grid','📊 Kanban','📅 Calendar','📈 Chart','🖼 Gallery'];
  let vx = 10;
  views.forEach((v,i) => {
    const active = i===0;
    roundRect(ctx, vx, 82, ctx.measureText(v).width+22, 26, 0, active?'#FFFFFF':'transparent');
    if (active) {
      ctx.strokeStyle='#166EE1'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(vx, 108); ctx.lineTo(vx+ctx.measureText(v).width+22, 108); ctx.stroke();
      ctx.lineWidth=1;
    }
    ctx.fillStyle = active?'#166EE1':'#66768A'; ctx.font=`${active?'600':'400'} 12px Arial`;
    ctx.fillText(v, vx+11, 99);
    vx += ctx.measureText(v).width+30;
  });

  // Grid
  const headers = ['','GRANT TITLE','FUNDER','SCORE','AMOUNT','DEADLINE','STATUS','ENTITY','NAICS','CATEGORY'];
  const cws = [32, 260, 160, 60, 80, 90, 80, 100, 80, 90];
  let hx=0, hy=112;

  // Header row
  ctx.fillStyle = '#F4F6F8'; ctx.fillRect(0, hy, W, 30);
  ctx.strokeStyle = '#D5DAE0'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,hy+30); ctx.lineTo(W,hy+30); ctx.stroke();
  hx=0;
  headers.forEach((h,i) => {
    if (i>0) { ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx,hy+30); ctx.stroke(); }
    ctx.fillStyle = '#8897A4'; ctx.font = 'bold 10px Arial';
    ctx.fillText(h, hx+8, hy+19);
    hx += cws[i];
  });

  // Data rows
  const gridGrants = [
    ['','VA Construction Renovation — SDVOSB Dallas TX','Dept of Veterans Affairs','91','$850K','Jun 8','scored','Walker Contr.','236220','Construction'],
    ['','SBIR Phase II: Workforce Technology Platform','Dept of Defense / SBIR','94','$300K','Jun 12','scored','Noble Erne','541511','EdTech'],
    ['','NSF CS for All — STEM Workforce Initiative','Natl Science Foundation','87','$250K','Jun 15','scored','Noble Erne','611420','STEM'],
    ['','DOL Employment & Training Admin Grant','Dept of Labor','83','$150K','Jun 18','applied','Noble Erne','541611','EdTech'],
    ['','Gates Foundation EdTech Innovation Award','Gates Foundation','76','$75K','Jun 22','scored','Noble Erne','611710','EdTech'],
    ['','HHS Community Health Worker Training','Dept of Health & Human Svcs','71','$120K','Aug 1','scored','Noble Erne','611430','EdTech'],
    ['','SBA SDVOSB Growth & Sustainability Fund','Small Business Admin','89','$250K','Jul 15','scored','Walker Contr.','236220','Construction'],
    ['','DOE Workforce Clean Energy Training','Dept of Energy','68','$200K','Sep 1','scored','Noble Erne','541519','EdTech'],
    ['','Kresge Foundation Arts & Education','Kresge Foundation','61','$50K','Sep 10','scored','Noble Erne','611699','EdTech'],
    ['','NASA STEM Education Supplemental Award','NASA','72','$100K','Aug 22','scored','Noble Erne','541715','STEM'],
  ];

  const scoreColors = {'91':'#22C55E','94':'#22C55E','87':'#22C55E','83':'#22C55E','76':'#F59E0B','71':'#F59E0B','89':'#22C55E','68':'#F59E0B','61':'#EF4444','72':'#F59E0B'};
  const statusBgs = {scored:'#EEF2FF', applied:'#FFFBEB'};
  const statusFgs = {scored:'#4F46E5', applied:'#B45309'};
  const catColors  = {EdTech:'#EEF2FF',STEM:'#F5F3FF',Construction:'#ECFDF5',Foundation:'#FFF7ED'};
  const catFgs     = {EdTech:'#3730A3',STEM:'#6D28D9',Construction:'#065F46',Foundation:'#92400E'};

  gridGrants.forEach((row, ri) => {
    const ry2 = hy+32+ri*34;
    ctx.fillStyle = ri%2===0?'#FFFFFF':'#FAFBFC'; ctx.fillRect(0, ry2, W, 34);
    ctx.strokeStyle='#E8EBF0'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,ry2+34); ctx.lineTo(W,ry2+34); ctx.stroke();

    let cx4=0;
    row.forEach((cell,ci) => {
      if (ci>0) { ctx.strokeStyle='#E8EBF0'; ctx.beginPath(); ctx.moveTo(cx4,ry2); ctx.lineTo(cx4,ry2+34); ctx.stroke(); }
      if (ci===0) { // checkbox
        roundRect(ctx, cx4+8, ry2+10, 14, 14, 2, 'transparent', '#CDD2DA');
        cx4+=cws[ci]; return;
      }
      if (ci===3) { // score
        ctx.fillStyle = scoreColors[cell]||'#8897A4'; ctx.font = 'bold 13px Arial';
        ctx.fillText(cell, cx4+8, ry2+21);
        scoreBar(ctx, cx4+28, ry2+16, 24, parseInt(cell));
      } else if (ci===5) { // status
        const bg=statusBgs[cell]||'#F4F6F8', fg=statusFgs[cell]||'#8897A4';
        roundRect(ctx, cx4+6, ry2+9, 62, 18, 9, bg);
        ctx.fillStyle = fg; ctx.font = '600 10px Arial';
        ctx.fillText(cell, cx4+14, ry2+21);
      } else if (ci===8) { // category
        const bg=catColors[cell]||'#F4F6F8', fg2=catFgs[cell]||'#8897A4';
        roundRect(ctx, cx4+6, ry2+9, cws[ci]-12, 18, 9, bg);
        ctx.fillStyle = fg2; ctx.font = '600 10px Arial';
        ctx.fillText(cell, cx4+12, ry2+21);
      } else {
        ctx.fillStyle = ci===1?'#1F2D3D':'#66768A';
        ctx.font = `${ci===1?'600':'400'} 11px Arial`;
        ctx.fillText(cell.slice(0,Math.floor(cws[ci]/6.5)), cx4+8, ry2+21);
      }
      cx4+=cws[ci];
    });
  });

  // + add row
  ctx.fillStyle = '#8897A4'; ctx.font = '11px Arial';
  ctx.fillText('+ Add grant', 44, hy+32+gridGrants.length*34+18);

  // Totals row
  ctx.fillStyle = '#F4F6F8'; ctx.fillRect(0, hy+32+gridGrants.length*34+28, W, 26);
  ctx.fillStyle = '#66768A'; ctx.font = 'bold 10px Arial';
  ctx.fillText(`${gridGrants.length} grants shown  ·  Total pipeline: $2.29M  ·  Avg score: 79`, 40, hy+32+gridGrants.length*34+44);

  ctx.fillStyle = '#66768A'; ctx.font = 'italic 10px Arial';
  ctx.fillText('UI Reference 5: Airtable-style grid — sortable columns, color-coded fields, switchable views (grid/kanban/calendar)', W/2-280, H-4);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// GENERATE WORD DOCUMENT
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('Generating UI mockup images...');
  const imgs = [
    { fn: mockup1_current,       label: 'Current Dashboard',             title: 'Current State: GRANT PRIME Dashboard' },
    { fn: mockup2_linear_pipeline, label: 'Linear-style Pipeline View',  title: 'Reference UI 1: Linear-style Issue Queue (Recommended)' },
    { fn: mockup3_kanban,        label: 'Kanban Board',                  title: 'Reference UI 2: Kanban Stage Board' },
    { fn: mockup4_command_palette,label:'Command Palette (⌘K)',          title: 'Reference UI 3: Command Palette Overlay (⌘K)' },
    { fn: mockup5_calendar,      label: 'Deadline Calendar',             title: 'Reference UI 4: Calendar Deadline View' },
    { fn: mockup6_grid,          label: 'Airtable-style Grid',           title: 'Reference UI 5: Data Grid with Multi-View Tabs' },
  ];

  const GRAY_BD  = 'D0D5DD';
  const DARK_BG  = '0B0F1A';
  const CYAN_FG  = '00B4CC';
  const GREEN_FG = '14A87A';
  const border   = { style: BorderStyle.SINGLE, size: 1, color: GRAY_BD };
  const borders  = { top: border, bottom: border, left: border, right: border };

  // ── Build sections ──────────────────────────────────────────
  const children = [];

  // Title page content
  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 120 },
      children: [new TextRun({ text: 'GRANT PRIME', bold: true, size: 52, color: '00B4CC', font: 'Arial' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'UI/UX Competitive Analysis', bold: true, size: 36, font: 'Arial', color: '1F2D3D' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: 'Noble Erne, LLC  ·  Walker Contractors LLC (SDVOSB)', size: 22, color: '8897A4', font: 'Arial' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 480 },
      children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`, size: 20, color: 'AAAAAA', font: 'Arial' })] }),
    new Paragraph({ children: [new TextRun({ break: 1 })] }),
  );

  // ── Section 1: Current State Diagnosis ──────────────────────
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: '1. Current Dashboard — State Diagnosis', font: 'Arial', bold: true, size: 30, color: '1F2D3D' })] }),
    new Paragraph({ spacing: { before: 0, after: 180 },
      children: [new TextRun({ text: 'The current GRANT PRIME dashboard is a single-page app with a dark sidebar navigation and a main content panel. It is functional and automation-first, but has UX friction points that slow down daily decision-making. Below is an honest evaluation.', font: 'Arial', size: 22, color: '334155' })] }),
  );

  // Current UI screenshot
  console.log('Rendering current UI...');
  const img0buf = imgs[0].fn();
  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: 'png', data: img0buf, transformation: { width: 680, height: 420 }, altText: { title: 'Current dashboard', description: 'Current GRANT PRIME dashboard screenshot', name: 'current-ui' } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: 'Figure 1: Current GRANT PRIME dashboard', italics: true, size: 18, color: '8897A4', font: 'Arial' })] }),
  );

  // Diagnosis table
  const diagRows = [
    ['✅ Strengths', '❌ Weaknesses'],
    ['Dark theme — reduces eye strain during long sessions', 'Sidebar has 13+ tabs — cognitive overload on first open'],
    ['Daily briefing card surfaces agent run status at a glance', 'No visual pipeline stage view — hard to see where grants are in the process'],
    ['Fuzzy search covers all fields (NAICS, funder, category)', 'Action Queue requires drilling in — no bulk actions possible'],
    ['SDVOSB + renewal badges on grant cards', 'No deadline calendar — can\'t see time context of multiple deadlines at once'],
    ['Budget filter on Action Queue ($10K / $50K / $100K / $250K+)', 'Grant detail requires clicking each row — no preview pane'],
    ['Health monitor + email on system failures', 'Performance tab is bottom of sidebar — metrics are buried, not at the top'],
  ];

  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: diagRows.map((row, ri) => new TableRow({
      tableHeader: ri===0,
      children: row.map((cell, ci) => new TableCell({
        borders,
        width: { size: 4680, type: WidthType.DXA },
        shading: ri===0 ? { fill: '1F2D3D', type: ShadingType.CLEAR } : { fill: ci===0?'F0FFF4':'FFF1F2', type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        children: [new Paragraph({ children: [new TextRun({ text: cell, font: 'Arial', size: ri===0?20:20, bold: ri===0, color: ri===0?'FFFFFF':ci===0?'166534':'991B1B' })] })]
      }))
    }))
  }));

  children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun('')] }));

  // ── Section 2: Verdict ───────────────────────────────────────
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: '2. Verdict — Is this the Best UI for Grant Management?', font: 'Arial', bold: true, size: 30, color: '1F2D3D' })] }),
    new Paragraph({ spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'Short answer: ', bold: true, font: 'Arial', size: 22 }), new TextRun({ text: 'No — for two reasons.', font: 'Arial', size: 22, color: '334155' })] }),
    new Paragraph({ spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'Grant management is a time-based pipeline problem. Every grant has a deadline, a score, and a status. The current sidebar-tab model treats every section as an isolated view — you navigate to "Ed/Tech" or "Action Queue" as separate destinations. This forces you to hold the full picture in your head rather than seeing it spatially. The best UIs for time-based pipelines are:', font: 'Arial', size: 22, color: '334155' })] }),
  );

  const points = [
    ['List views that surface urgency inline', 'Like Linear — every item shows score, days left, and owner without clicking in.'],
    ['Stage boards that show where things are in the process', 'Kanban columns (Discovered → Scored → Applied → Won) make pipeline blockages instantly visible.'],
    ['Calendar views that anchor deadlines to time', 'Seeing "3 grants close this week" in a calendar context beats reading a sorted list.'],
    ['Command palettes that collapse navigation', 'Instead of 13 sidebar tabs, one ⌘K shortcut surfaces any grant, action, or view instantly.'],
    ['Grid views that enable bulk operations', 'Airtable-style tables let you sort, filter, and group — and act on multiple records at once.'],
  ];

  points.forEach(([title, detail]) => {
    children.push(new Paragraph({
      numbering: { reference: 'points', level: 0 }, spacing: { before: 60, after: 40 },
      children: [new TextRun({ text: title + ' — ', bold: true, font: 'Arial', size: 22, color: '1F2D3D' }), new TextRun({ text: detail, font: 'Arial', size: 22, color: '334155' })]
    }));
  });

  // ── Section 3: Reference UIs ─────────────────────────────────
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: '3. Five Reference UIs — Annotated', font: 'Arial', bold: true, size: 30, color: '1F2D3D' })] }),
  );

  const uiDetails = [
    {
      title: 'Reference UI 1: Linear-style Pipeline List',
      priority: 'HIGHEST PRIORITY — Build This Next',
      priorityColor: '14A87A',
      what: 'A dense, sortable list that shows every grant with inline score, amount, days-to-deadline, status, and entity — all without clicking in. Sections group grants by urgency (≤14d, ≤30d, scored, etc.). Keyboard shortcuts (⌘K, G for goto) make navigation zero-click.',
      why: 'Grant prime\'s core workflow is daily triage — scanning for what needs action TODAY. The current UI requires 3-4 clicks to answer "what should I work on right now?". A Linear-style list answers it in under 2 seconds by putting urgency indicators, scores, and amounts inline on every row.',
      how: 'Replace or supplement the current "Action Queue" and entity tabs with a unified list view. Add section headers by urgency tier. Surface keyboard shortcut hints in the footer.',
    },
    {
      title: 'Reference UI 2: Kanban Stage Board',
      priority: 'HIGH PRIORITY — Adds Pipeline Visibility',
      priorityColor: '00B4CC',
      what: 'Four columns (Discovered, Scored ≥80, Applied, Won) showing grants as cards. Each card shows score badge, title, amount, deadline, and entity tag. Cards are draggable between stages to mark progress.',
      why: 'Right now there is no way to see "where are all our grants in the process" at a glance. Are we bottlenecked at application? Are high-scoring grants sitting un-applied for weeks? Kanban makes these gaps immediately visible.',
      how: 'Add a /board route to the dashboard that renders grants grouped by status. Drag-and-drop updates status via Supabase upsert. Filter by entity (Ed/Tech vs Construction) using the top tabs.',
    },
    {
      title: 'Reference UI 3: Command Palette (⌘K)',
      priority: 'MEDIUM PRIORITY — Quick Win, High ROI',
      priorityColor: '8B5CF6',
      what: 'A global search overlay triggered by ⌘K (or Ctrl+K). Searches across all grants, actions, and views. Shows top results with score and deadline inline. Supports commands like "Open Action Queue", "Draft proposal for...", "Show closing this week".',
      why: 'The current 13-tab sidebar requires knowing where things live. The command palette eliminates navigation entirely — you just describe what you want. This is especially valuable when checking the dashboard quickly between client calls.',
      how: 'Extend the existing runGrantSearch() into a full-screen modal. Add action items (GitHub Actions links, proposal drafting, navigation shortcuts). Wire to keyboard shortcut ⌘K / Ctrl+K.',
    },
    {
      title: 'Reference UI 4: Calendar Deadline View',
      priority: 'MEDIUM PRIORITY — Time Context for Decision-Making',
      priorityColor: 'F59E0B',
      what: 'A monthly calendar where each day with a grant deadline shows a color-coded event chip (red for urgent, amber for soon, green for comfortable). A right-side panel lists the next N deadlines chronologically. Click any day to see full grant details.',
      why: 'The current deadline tracker sorts grants by days remaining — but a sorted list loses the time context. Seeing "3 grants close between June 8-12" on a calendar makes it immediately obvious you have a crunch week coming, and you can plan accordingly.',
      how: 'Add a /calendar view. Render grants.deadline as calendar events. Color-code by urgency tier (≤7d red, 8-14d amber, 15-30d green). Reuse existing daysLeft() and urgencyClass() helper functions.',
    },
    {
      title: 'Reference UI 5: Airtable-style Data Grid',
      priority: 'LOWER PRIORITY — Power-User Feature',
      priorityColor: '8897A4',
      what: 'A spreadsheet-style grid with every grant as a row and all fields as sortable, filterable columns. Color-coded cells for score (green/amber/red), status (colored pills), and category. View switcher tabs (Grid / Kanban / Calendar / Chart) at the top.',
      why: 'When you want to do analytical work — "show me all Construction grants above $100K sorted by score" — the current filter system requires combining sidebar tabs with quick-filters. A grid lets you sort and filter on any column combination, and bulk-update status for multiple grants at once.',
      how: 'Use a lightweight table library (like AG Grid Community or vanilla JS) to render the GRANTS array. Connect column sorts/filters to client-side JS. Bulk-select with checkboxes → status update dropdown.',
    },
  ];

  for (let i=0; i<5; i++) {
    const ui = uiDetails[i];
    const imgIdx = i + 1;
    console.log(`Rendering UI mockup ${imgIdx+1}...`);
    const imgBuf = imgs[imgIdx].fn();

    children.push(
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 80 },
        children: [new TextRun({ text: ui.title, font: 'Arial', bold: true, size: 26, color: '1F2D3D' })] }),
    );

    // Priority badge
    children.push(new Paragraph({ spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: `⬟ ${ui.priority}`, bold: true, font: 'Arial', size: 20, color: ui.priorityColor })] }));

    // Screenshot
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 },
        children: [new ImageRun({ type: 'png', data: imgBuf, transformation: { width: 680, height: 420 }, altText: { title: ui.title, description: ui.title, name: `ui-${i+1}` } })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 180 },
        children: [new TextRun({ text: `Figure ${i+2}: ${ui.title}`, italics: true, size: 18, color: '8897A4', font: 'Arial' })] }),
    );

    // What / Why / How table
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [1440, 7920],
      rows: [
        ['WHAT', ui.what, '2A3D5A', 'E8EEF6'],
        ['WHY', ui.why, '14522A', 'ECFDF5'],
        ['HOW', ui.how, '4C2B8A', 'F5F3FF'],
      ].map(([label, text, fg, bg]) => new TableRow({
        children: [
          new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, verticalAlign: 'center',
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, font: 'Arial', size: 18, color: fg })] })] }),
          new TableCell({ borders, width: { size: 7920, type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text, font: 'Arial', size: 20, color: '334155' })] })] }),
        ]
      }))
    }));

    children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun('')] }));
  }

  // ── Section 4: Implementation Roadmap ────────────────────────
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: '4. Implementation Roadmap', font: 'Arial', bold: true, size: 30, color: '1F2D3D' })] }),
    new Paragraph({ spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'Ordered by impact vs. build effort. All additions are client-side JS within the existing index.html architecture — no backend changes needed.', font: 'Arial', size: 22, color: '334155' })] }),
  );

  const roadmap = [
    ['Sprint 1', '⌘K Command Palette', '1–2 days', 'Extend runGrantSearch() into full-screen modal. Add keyboard shortcut. Add action commands.'],
    ['Sprint 1', 'Linear-style List Enhancements', '1–2 days', 'Add inline urgency indicators, days-left column, entity color on all list rows. Section headers by tier.'],
    ['Sprint 2', 'Kanban Board View (/board)', '3–4 days', 'New view tab. Render grants grouped by status as columns. Drag-to-update via Supabase. Entity filter toggle.'],
    ['Sprint 2', 'Calendar View (/calendar)', '2–3 days', 'Monthly grid. Plot deadlines as colored chips. Right panel for upcoming list. Reuse daysLeft() logic.'],
    ['Sprint 3', 'Grid View with Multi-View Tabs', '4–5 days', 'Sortable/filterable table. Bulk select + status update. View switcher (Grid/Kanban/Calendar). Export CSV.'],
    ['Sprint 3', 'Preview Panel (no-click detail)', '2 days', 'Right-side drawer that opens on row hover/click. Shows full grant detail without leaving the list.'],
  ];

  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [900, 1980, 900, 5580],
    rows: [
      ['Sprint', 'Feature', 'Effort', 'Implementation Notes'].map(h => new TableCell({ borders, width: { size: [900,1980,900,5580][[' Sprint', 'Feature', 'Effort', 'Implementation Notes'].indexOf(h)], type: WidthType.DXA }, shading: { fill: '1F2D3D', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: 'Arial', size: 18, color: 'FFFFFF' })] })]
      })),
      ...roadmap.map(([sprint, feature, effort, notes], ri) => [
        new TableCell({ borders, width: { size: 900, type: WidthType.DXA }, shading: { fill: ri<2?'E8F4FD':ri<4?'F0F4FF':'F5F3FF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: sprint, bold: true, font: 'Arial', size: 18, color: ri<2?'0369A1':ri<4?'4F46E5':'6D28D9' })] })] }),
        new TableCell({ borders, width: { size: 1980, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: feature, bold: true, font: 'Arial', size: 18, color: '1F2D3D' })] })] }),
        new TableCell({ borders, width: { size: 900, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: effort, font: 'Arial', size: 18, color: '66768A' })] })] }),
        new TableCell({ borders, width: { size: 5580, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: notes, font: 'Arial', size: 18, color: '334155' })] })] }),
      ]).map(cells => new TableRow({ children: cells })),
    ].flat()
  }));

  children.push(
    new Paragraph({ spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: 'Automation-first rule: ', bold: true, font: 'Arial', size: 22, color: '14A87A' }),
        new TextRun({ text: 'All UI enhancements read from the GRANTS array already loaded in memory — no additional API calls, no new backend endpoints, no increased cost. The pipeline data is already there; the work is purely in how it\'s presented.', font: 'Arial', size: 22, color: '334155' })] }),
  );

  // ── Build document ───────────────────────────────────────────
  console.log('Building Word document...');
  const doc = new Document({
    numbering: {
      config: [
        { reference: 'points', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ]
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 30, bold: true, font: 'Arial', color: '1F2D3D' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '1F2D3D' },
          paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 1 } },
      ]
    },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E8EC', space: 6 } },
          children: [
            new TextRun({ text: 'GRANT PRIME — UI Analysis', font: 'Arial', size: 18, color: '8897A4' }),
            new TextRun({ text: '    Noble Erne, LLC  ·  Confidential', font: 'Arial', size: 18, color: 'BBBBBB' }),
          ]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E8EC', space: 6 } },
          children: [
            new TextRun({ text: 'Page ', font: 'Arial', size: 18, color: 'AAAAAA' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: 'AAAAAA' }),
            new TextRun({ text: '  ·  GRANT PRIME UI Analysis  ·  Noble Erne, LLC', font: 'Arial', size: 18, color: 'CCCCCC' }),
          ]
        })] })
      },
      children,
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = 'grant-prime-ui-analysis.docx';
  writeFileSync(outPath, buffer);
  console.log(`✅ Done! Saved: ${outPath}`);
  console.log(`   Open it in Word or Google Docs.`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
