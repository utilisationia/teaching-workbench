'use strict';
/* ============================================================
 * 核心引擎 app.js（与 data.js 配合使用，请保持同一目录）
 * ============================================================ */
/* ============================================================
 * 工具函数
 * ============================================================ */
const $ = s => document.querySelector(s);
const CATS = ['语音', '语法', '交际', '词汇', 'Lecture', '其他'];
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDT(iso) { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtDateCN(iso) { const d = new Date(iso); return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日'; }
function fmtTime(iso) { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function unitAbbr(u) { if (!u) return ''; if (u.id === 'review_mid') return '期中'; if (u.id === 'review_final') return '期末'; return u.id.toUpperCase(); }
function titleShort(t) { return String(t || '').split(/[（(]/)[0].trim(); }
function catColor(c) { return ({'语音':'bg-sky-100 text-sky-700','语法':'bg-violet-100 text-violet-700','交际':'bg-amber-100 text-amber-700','词汇':'bg-emerald-100 text-emerald-700','Lecture':'bg-rose-100 text-rose-700','其他':'bg-stone-100 text-stone-600'}[c]) || 'bg-stone-100 text-stone-600'; }
const EVAL_EMOJI = { '头部': '🟢', '中等': '🟡', '末尾': '🔴' };

/* ============================================================
 * 课表辅助：日期 / 排序 / 预设单元 / 被冲掉处理
 * ============================================================ */
const DOW_ORDER = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7 };
function dateMD(week, day) {
  const start = new Date((DataManager.data.meta.semesterStart || '2026-09-07') + 'T00:00:00');
  const d = new Date(start.getTime() + (week - 1) * 7 * 86400000 + (DOW_ORDER[day] - 1) * 86400000);
  return (d.getMonth() + 1) + '.' + d.getDate();
}
function sortedTimetable() {
  return [...DataManager.data.timetable].sort((a, b) =>
    (a.week - b.week) || (DOW_ORDER[a.day] - DOW_ORDER[b.day]) || (a.period - b.period));
}
function checkableList() { return sortedTimetable().filter(t => !t.cancelled); }
function nextTimetableAfter(tid) {
  const arr = checkableList();
  const i = arr.findIndex(t => t.id === tid);
  return i >= 0 ? arr[i + 1] : null;
}
function prevTimetableBefore(tid) {
  const arr = checkableList();
  const i = arr.findIndex(t => t.id === tid);
  return i > 0 ? arr[i - 1] : null;
}
function seqInWeek(t) {
  return checkableList().filter(x => x.week === t.week).findIndex(x => x.id === t.id) + 1;
}
/* 预设课程进度：周次 -> 默认教学项目
 * 2-8周=U1-U7；9周=期中；10周=U8；11-16周=U9-U14；17周=期末 */
const WEEK_UNIT_DEFAULT = {
  2: 'u1', 3: 'u2', 4: 'u3', 5: 'u4', 6: 'u5', 7: 'u6', 8: 'u7',
  9: 'review_mid', 10: 'u8', 11: 'u9', 12: 'u10', 13: 'u11', 14: 'u12', 15: 'u13', 16: 'u14', 17: 'review_final'
};
function presetUnitFor(t) {
  const base = WEEK_UNIT_DEFAULT[t.week];
  if (base === undefined) return t.week >= 18 ? 'review_final' : '';
  return base;
}
function tDisplay(t) { return t ? (t.displayName || ('第' + t.week + '周' + t.day + ' 第' + t.period + '大节')) : ''; }

/* ============================================================
 * 数据管理（唯一入口，所有读写经由此对象）
 * ============================================================ */
const STORAGE_KEY = 'teaching_workbench_v1';
const DataManager = {
  data: null,
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch (e) { this.data = null; }
    if (!this.data) {
      this.data = {
        timetable: clone(timetable),
        syllabus: clone(syllabus),
        knowledgeItems: clone(knowledgeItems),
        lessons: [],
        students: clone(students),
        meta: clone(meta)
      };
    }
    this.ensure();
  },
  save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); },
  ensure() {
    const d = this.data;
    if (!Array.isArray(d.timetable)) d.timetable = clone(timetable);
    if (!Array.isArray(d.syllabus)) d.syllabus = clone(syllabus);
    if (!Array.isArray(d.knowledgeItems)) d.knowledgeItems = clone(knowledgeItems);
    if (!Array.isArray(d.students)) d.students = clone(students);
    if (!d.meta) d.meta = clone(meta);
    d.meta.totalLessons = checkableList().length;
    if (!Array.isArray(d.lessons)) d.lessons = [];
    if (!d.lessons.length) {
      const firstT = checkableList()[0];
      d.lessons.push({
        id: 'l1', timetableId: firstT ? firstT.id : (d.timetable[0] || {}).id, unitId: d.syllabus[0].id,
        checkedKnowledgeIds: [], completed: false, completedAt: null,
        memos: [], homework: []
      });
    }
    d.lessons.forEach(l => {
      if (!Array.isArray(l.memos)) {
        l.memos = l.memo ? [{ id: uid('m'), content: l.memo, createdAt: l.memoAt || l.completedAt || new Date().toISOString() }] : [];
      }
      if (!Array.isArray(l.homework)) l.homework = [];
      l.homework.forEach(h => { if (!h.id) h.id = uid('h'); });
      if (!Array.isArray(l.checkedKnowledgeIds)) l.checkedKnowledgeIds = [];
    });
    // Add new built-in knowledge to existing local records without replacing user edits.
    const u1 = d.syllabus.find(u => u.id === 'u1');
    if (u1) {
      const additions = ['k178', 'k179', 'k180'];
      additions.forEach(id => {
        const item = knowledgeItems.find(k => k.id === id);
        if (item && !d.knowledgeItems.some(k => k.id === id)) d.knowledgeItems.push(clone(item));
      });
      u1.knowledgeIds = u1.knowledgeIds.filter(id => !additions.includes(id));
      const anchor = u1.knowledgeIds.indexOf('k12');
      u1.knowledgeIds.splice(anchor < 0 ? u1.knowledgeIds.length : anchor + 1, 0, ...additions);
    }
    this.recomputeUnitProgress();
    if (!d.meta.currentLessonId || !d.lessons.some(l => l.id === d.meta.currentLessonId)) d.meta.currentLessonId = d.lessons[0].id;
  },
  recomputeUnitProgress() {
    this.data.syllabus.forEach(u => {
      const lessons = this.data.lessons.filter(l => l.completed && l.unitId === u.id);
      const checked = new Set(lessons.flatMap(l => l.checkedKnowledgeIds || []));
      u.checkedKnowledgeIds = u.knowledgeIds.filter(id => checked.has(id));
      u.completed = u.knowledgeIds.length > 0 && u.knowledgeIds.every(id => checked.has(id));
      u.completedAt = u.completed ? lessons.map(l => l.completedAt).filter(Boolean).sort().slice(-1)[0] || null : null;
    });
  },
  recalc() { if (this.data && this.data.meta) this.data.meta.totalLessons = checkableList().length; },
  getTimetable(id) { return this.data.timetable.find(t => t.id === id); },
  getUnit(id) { return this.data.syllabus.find(u => u.id === id); },
  getKnowledge(id) { return this.data.knowledgeItems.find(k => k.id === id); },
  getLessonById(id) { return this.data.lessons.find(l => l.id === id); },
  getLessonByTimetable(tid) { return this.data.lessons.find(l => l.timetableId === tid); },
  currentLesson() { return this.getLessonById(this.data.meta.currentLessonId); },
  timetableIndex(tid) { return this.data.timetable.findIndex(t => t.id === tid); },
  completedCount() { return this.data.lessons.filter(l => l.completed).length; },
  unitOfKnowledge(kid) { return this.data.syllabus.find(u => u.knowledgeIds.includes(kid)); }
};

/* ============================================================
 * 全局状态
 * ============================================================ */
const State = {
  view: 'progress',          // progress | syllabus | syllabusDetail | timetable | lessonDetail | board | notes | students | studentDetail
  lessonId: null,            // 进度页当前显示的课（回顾用）
  unitId: null,
  tid: null,
  timetableWeek: null,
  studentId: null,
  boardCategory: CATS[0],
  selectedStudents: new Set(),
  studentUI: null
};

/* ============================================================
 * Toast / 底部抽屉
 * ============================================================ */
function toast(msg, duration) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), duration || 1800);
}
let sheetCloseTimer = null;
function openSheet(title, bodyHtml) {
  clearTimeout(sheetCloseTimer);
  $('#sheetRoot').innerHTML = `
    <div id="sheetBackdrop" class="sheet-backdrop" data-action="close-sheet"></div>
    <div id="sheet" class="sheet">
      <div class="sticky top-0 bg-white px-5 pt-3 pb-2 flex items-center justify-between border-b border-stone-100">
        <div class="font-semibold text-[17px]">${esc(title)}</div>
        <button data-action="close-sheet" class="w-8 h-8 rounded-lg text-stone-400 text-lg">✕</button>
      </div>
      <div class="px-5 py-4">${bodyHtml}</div>
    </div>`;
  requestAnimationFrame(() => {
    $('#sheetBackdrop').classList.add('open');
    $('#sheet').classList.add('open');
  });
}
function closeSheet() {
  const b = $('#sheetBackdrop'), s = $('#sheet');
  if (b) b.classList.remove('open');
  if (s) s.classList.remove('open');
  sheetCloseTimer = setTimeout(() => { $('#sheetRoot').innerHTML = ''; }, 300);
}
function downloadText(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

/* ============================================================
 * 页面框架
 * ============================================================ */
function pageShell(title, body, opts) {
  opts = opts || {};
  const left = opts.back
    ? `<button data-action="${opts.back}" class="w-9 h-9 rounded-xl bg-white border border-stone-200/70 shadow-sm text-lg flex items-center justify-center">←</button>`
    : `<button data-action="open-sidebar" class="w-9 h-9 rounded-xl bg-white border border-stone-200/70 shadow-sm text-lg flex items-center justify-center">☰</button>`;
  return `
    <div class="px-4 pt-4">
      <div class="flex items-center gap-2 mb-3">
        ${left}
        <h1 class="text-[18px] font-bold flex-1 min-w-0">${title}</h1>
        ${opts.right || ''}
      </div>
      <div class="space-y-2">${body}</div>
    </div>`;
}

function renderApp() {
  const navItems = [
    { key: 'progress', icon: '📈', label: '教学进度' },
    { key: 'syllabus', icon: '📖', label: '教学大纲' },
    { key: 'timetable', icon: '📅', label: '课表安排' },
    { key: 'board', icon: '📊', label: '知识看板' },
    { key: 'notes', icon: '📝', label: '备注汇总' },
    { key: 'students', icon: '👨‍🎓', label: '学生档案' }
  ];
  $('#app').innerHTML = `
    <div id="overlay" class="overlay" data-action="close-sidebar"></div>
    <aside id="drawer" class="drawer safe-top">
      <div class="px-5 py-6">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-[#37352F] text-white flex items-center justify-center text-lg">👩‍🏫</div>
          <div>
            <div class="font-semibold text-[17px]">教学工作台</div>
            <div class="text-xs text-stone-400">En route! · 2026-2027</div>
          </div>
        </div>
        <nav class="space-y-1">
          ${navItems.map(n => `
            <button data-action="nav" data-view="${n.key}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[17px] ${State.view === n.key ? 'bg-[#F0EEE9] font-medium' : 'text-stone-600 hover:bg-[#F7F6F3]'}">
              <span class="text-lg">${n.icon}</span>${n.label}
            </button>`).join('')}
        </nav>
        <div class="mt-6 pt-4 border-t border-stone-100 space-y-1">
          <button data-action="export-progress-csv" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[17px] text-stone-600 hover:bg-[#F7F6F3]"><span class="text-lg">📤</span>导出课程进度表</button>
          <button data-action="backup-export" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[17px] text-stone-600 hover:bg-[#F7F6F3]"><span class="text-lg">💾</span>导出备份</button>
          <button data-action="backup-import" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[17px] text-stone-600 hover:bg-[#F7F6F3]"><span class="text-lg">📥</span>导入备份</button>
          <button data-action="clear-data" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[17px] text-red-500 hover:bg-red-50"><span class="text-lg">🗑️</span>清空数据</button>
        </div>
      </div>
    </aside>
    <main id="main" class="mx-auto w-full max-w-[600px] min-h-screen safe-top safe-bottom pb-24">${renderView()}</main>`;
}

function renderView() {
  switch (State.view) {
    case 'progress': return renderProgress();
    case 'syllabus': return renderSyllabus();
    case 'syllabusDetail': return renderSyllabusDetail();
    case 'timetable': return renderTimetable();
    case 'lessonDetail': return renderLessonDetail();
    case 'board': return renderBoard();
    case 'notes': return renderNotes();
    case 'students': return renderStudents();
    case 'studentDetail': return renderStudentDetail();
    default: return renderProgress();
  }
}

/* ============================================================
 * 模块一：教学进度（默认首页）
 * ============================================================ */
function renderProgress() {
  const d = DataManager.data;
  const total = d.meta.totalLessons;
  const done = DataManager.completedCount();
  const pct = Math.round(done / total * 100);
  let lesson = State.lessonId ? DataManager.getLessonById(State.lessonId) : DataManager.currentLesson();
  if (!lesson) lesson = DataManager.currentLesson();
  const t = DataManager.getTimetable(lesson.timetableId);
  const unit = DataManager.getUnit(lesson.unitId);
  const isCurrent = lesson.id === d.meta.currentLessonId;
  const orderedLessons = checkableList();
  const tIdx = orderedLessons.findIndex(x => x.id === lesson.timetableId);
  const priorTimetableIds = new Set(orderedLessons.slice(0, tIdx).map(x => x.id));
  const priorChecked = new Set(d.lessons.filter(l => l.completed && priorTimetableIds.has(l.timetableId)).flatMap(l => l.checkedKnowledgeIds));
  const allDone = done >= total;

  const knowledgeRows = unit.knowledgeIds.map(kid => {
    const k = DataManager.getKnowledge(kid);
    if (!k) return '';
    const checked = lesson.checkedKnowledgeIds.includes(kid);
    const prior = priorChecked.has(kid);
    const checkClass = checked ? 'knowledge-check selected' : prior ? 'knowledge-check taught' : 'knowledge-check';
    const checkLabel = checked ? '本课已选中' : prior ? '此前已讲' : '尚未讲';
    return `
      <div class="flex items-center gap-2 py-1.5">
        <button data-action="add-hw-knowledge" data-kid="${kid}" class="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-stone-200 text-stone-500">📝</button>
        <button data-action="toggle-knowledge" data-kid="${kid}" class="flex-1 min-w-0 flex items-start gap-2 text-left">
          <span class="${checkClass}" role="img" aria-label="${checkLabel}" title="${checkLabel}">${checked ? '✓' : ''}</span>
          <span class="text-[16px] leading-snug ${checked ? 'text-stone-400 line-through' : ''}"><span class="tag ${catColor(k.category)} mr-1">${k.category}</span>${esc(k.name)}${prior ? '<span class="text-xs text-stone-400 ml-1">此前已讲</span>' : ''}</span>
        </button>
      </div>`;
  }).join('');

  const memoBlock = lesson.memos.length
    ? lesson.memos.map(m => `<div class="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-[16px]">${esc(m.content)}<div class="text-[13px] text-stone-400 mt-1">${fmtDT(m.createdAt)} · <button data-action="edit-memo" data-memo="${m.id}" class="text-emerald-600">编辑</button></div></div>`).join('')
    : `<div class="text-[15px] text-stone-400">暂无备注</div>`;

  const hwBlock = (lesson.homework && lesson.homework.length)
    ? lesson.homework.map(h => `
        <div class="flex items-start gap-2 rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-[16px]">
          <span class="tag ${catColor(h.category)} shrink-0">${esc(h.category)}</span>
          <span class="min-w-0 flex-1">${esc(h.content)}</span><button data-action="edit-homework" data-hid="${h.id}" class="text-emerald-600 text-sm">编辑</button><button data-action="delete-homework" data-hid="${h.id}" class="text-red-500 text-sm">删除</button>
        </div>`).join('')
    : `<div class="text-[15px] text-stone-400">暂无作业</div>`;

  return `
    <header class="sticky top-0 z-30 bg-[#F7F6F3]/95 backdrop-blur px-4 pt-3 pb-2">
      <div class="flex items-center gap-2 mb-2">
        <button data-action="open-sidebar" class="w-9 h-9 rounded-xl bg-white border border-stone-200/70 shadow-sm text-lg">☰</button>
        <div class="flex-1 text-[17px] font-medium">👩‍🏫 总进度：<span class="font-bold">${done}/${total}</span>大节</div>
        <div class="text-xs text-stone-400">${pct}%</div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </header>
    <div class="px-4 pt-3 space-y-3">
      ${allDone ? `<div class="card px-4 py-3 bg-amber-50 border-amber-200 text-amber-700 text-sm font-medium">🎉 全部 ${total} 大节已完成！</div>` : ''}
      <div class="card px-3 py-3">
        <div class="flex items-center gap-2">
          <button data-action="prev-lesson" class="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-stone-200 text-stone-500 ${tIdx <= 0 ? 'opacity-30 pointer-events-none' : ''}">◀</button>
          <div class="flex-1 min-w-0 text-[16px] leading-tight">
            <div class="font-semibold">${t.displayName}</div>
            <div class="text-xs text-stone-400 mt-0.5">${t.room} · ${t.periods}</div>
            ${t.originalNote ? `<div class="text-xs text-amber-600 mt-0.5">📌 ${esc(t.originalNote)}</div>` : ''}
          </div>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <select data-action="unit-change" data-lesson="${lesson.id}" ${lesson.completed || !isCurrent ? 'disabled' : ''} class="flex-1 min-w-0 text-[15px] rounded-lg border border-stone-200 bg-white px-2 py-1.5 focus:outline-none ${lesson.completed ? 'text-stone-400' : ''}">
            ${d.syllabus.map(u => `<option value="${u.id}" ${u.id === unit.id ? 'selected' : ''}>${unitAbbr(u)} ${esc(titleShort(u.title))}</option>`).join('')}
          </select>
          ${lesson.completed
            ? `<span class="text-xs text-emerald-600 font-medium whitespace-nowrap">✅ ${fmtDT(lesson.completedAt).slice(5, 16)}</span>`
            : `<span class="text-xs text-stone-400 whitespace-nowrap">未打卡</span>`}
        </div>
        ${!isCurrent ? `<button data-action="goto-current" class="mt-2 text-xs text-emerald-600 font-medium">→ 回到当前课程</button>` : ''}
      </div>

      <div class="card px-3 py-3">
        <div class="text-[17px] font-semibold mb-1">📌 ${unitAbbr(unit)} 知识点打卡</div>
        <div class="text-[13px] text-stone-400 mb-1">点击知识点切换完成状态；📝 为该知识点添加作业/练习</div>
        <div class="knowledge-legend"><span><i class="knowledge-check"></i>尚未讲</span><span><i class="knowledge-check taught"></i>此前已讲</span><span><i class="knowledge-check selected">✓</i>本课选中</span></div>
        <div class="space-y-0.5">${knowledgeRows}</div>
      </div>

      <div class="card px-3 py-3">
        <div class="text-[17px] font-semibold mb-2">📒 本节课备注</div>
        ${memoBlock}
          <div class="flex gap-2 mt-2">
            <input id="memoInput" class="flex-1 min-w-0 rounded-xl border border-stone-200 px-3 py-2 text-[16px] focus:outline-none focus:border-stone-400" placeholder="记录本节课备注…">
            <button data-action="save-memo" class="shrink-0 rounded-xl bg-[#37352F] text-white text-[15px] px-4">确认添加</button>
          </div>
      </div>

      <div class="card px-3 py-3">
        <div class="text-[17px] font-semibold mb-2">📚 本课课后作业</div>
        <div class="space-y-1">${hwBlock}</div>
        <button data-action="add-homework" class="mt-2 w-full rounded-xl border border-dashed border-stone-300 py-2 text-[15px] text-stone-500">+ 添加作业</button>
      </div>
    </div>
    <div class="bottom-action">
      ${lesson.completed
        ? `<button disabled class="w-full rounded-2xl bg-stone-200 text-stone-400 py-3.5 text-[17px] font-semibold">✅ 已打卡</button>`
        : `<button data-action="complete-lesson" class="w-full rounded-2xl bg-[#4CAF50] text-white py-3.5 text-[17px] font-semibold shadow-lg shadow-emerald-200 active:scale-[0.99]">✅ 完成本课打卡</button>`}
    </div>`;
}

/* ============================================================
 * 模块二：教学大纲
 * ============================================================ */
function renderSyllabus() {
  const rows = DataManager.data.syllabus.map(u => {
    const checked = (u.checkedKnowledgeIds || []).length;
    const total = u.knowledgeIds.length;
    let status;
    if (u.completed) status = `<span class="text-emerald-600 text-[15px] font-medium whitespace-nowrap">✅ 已完成</span>`;
    else if (checked > 0) status = `<span class="text-amber-600 text-[15px] font-medium whitespace-nowrap">⏳ ${checked}/${total}</span>`;
    else status = `<span class="text-stone-400 text-[15px] whitespace-nowrap">⬜ 未开始</span>`;
    return `
      <button data-action="open-unit" data-unit="${u.id}" class="w-full card px-3 py-3 flex items-center gap-2 active:scale-[0.995]">
        <span class="w-10 h-10 rounded-xl ${u.id.includes('review') ? 'bg-amber-50 border border-amber-200' : 'bg-[#F0EEE9]'} flex items-center justify-center text-[17px] font-semibold shrink-0">${unitAbbr(u)}</span>
        <span class="flex-1 min-w-0 text-left text-[16px] font-medium leading-snug">${esc(titleShort(u.title))}</span>
        ${status}
        <span class="text-stone-300">›</span>
      </button>`;
  }).join('');
  return pageShell('📖 教学大纲', rows + `<div class="text-[13px] text-stone-400 px-2 pt-1">数据源：《教学大纲与知识点-整理清单.md》</div>`);
}

function renderSyllabusDetail() {
  const unit = DataManager.getUnit(State.unitId);
  if (!unit) { State.view = 'syllabus'; return renderSyllabus(); }
  const rows = unit.knowledgeIds.map(kid => {
    const k = DataManager.getKnowledge(kid);
    if (!k) return '';
    const checked = (unit.checkedKnowledgeIds || []).includes(kid);
    return `
      <div class="card px-3 py-2.5 flex items-center gap-2">
        <span class="text-[16px] shrink-0">${checked ? '✅' : '⬜'}</span>
        <span class="tag ${catColor(k.category)} shrink-0">${k.category}</span>
        <span class="flex-1 min-w-0 text-[16px] ${checked ? 'text-stone-400' : ''}">${esc(k.name)}</span>
        <button data-action="edit-knowledge" data-unit="${unit.id}" data-kid="${kid}" class="text-stone-400 text-[15px] px-1">✏️</button>
        <button data-action="unlink-knowledge" data-unit="${unit.id}" data-kid="${kid}" class="text-stone-400 text-[15px] px-1">🗑️</button>
      </div>`;
  }).join('');
  return pageShell(`${unitAbbr(unit)}: ${esc(titleShort(unit.title))}`,
    (rows || `<div class="text-[15px] text-stone-400 px-2">暂无知识点，点击下方添加</div>`) +
    `<div class="bottom-action"><button data-action="open-add-knowledge" class="w-full rounded-2xl bg-[#37352F] text-white py-3 text-[16px] font-medium">+ 添加知识点</button></div>`,
    { back: 'open-syllabus', right: `<span class="text-xs text-stone-400 whitespace-nowrap">${(unit.checkedKnowledgeIds || []).length}/${unit.knowledgeIds.length}</span>` });
}

function openAddKnowledgeSheet() {
  const unit = DataManager.getUnit(State.unitId);
  if (!unit) return;
  const avail = DataManager.data.knowledgeItems.filter(k => !unit.knowledgeIds.includes(k.id));
  openSheet('添加知识点', `
    <button data-action="new-knowledge" class="w-full mb-3 rounded-xl border border-dashed border-stone-300 py-2.5 text-[15px] text-stone-500">＋ 新建知识点</button>
    <div class="text-[14px] text-stone-400 mb-1">从全局知识点库选择：</div>
    <div class="space-y-1.5 max-h-64 overflow-y-auto">
      ${avail.map(k => `<button data-action="pick-knowledge" data-kid="${k.id}" class="w-full card px-3 py-2 flex items-center gap-2 text-left"><span class="tag ${catColor(k.category)} shrink-0">${k.category}</span><span class="text-[15px] min-w-0">${esc(k.name)}</span></button>`).join('') || '<div class="text-stone-400 text-[15px]">知识点库已全部关联到本项目</div>'}
    </div>`);
}
function openNewKnowledgeSheet() {
  openSheet('新建知识点', `
    <div class="space-y-3">
      <div><label class="text-[15px] text-stone-500">名称</label>
        <input id="nkName" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none focus:border-stone-400" placeholder="知识点名称"></div>
      <div><label class="text-[15px] text-stone-500">分类</label>
        <select id="nkCat" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
      <button data-action="save-new-knowledge" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px] font-medium">保存</button>
    </div>`);
}
function openEditKnowledgeSheet(kid) {
  const k = DataManager.getKnowledge(kid);
  if (!k) return;
  openSheet('编辑知识点', `
    <div class="space-y-3">
      <div><label class="text-[15px] text-stone-500">名称</label>
        <input id="ekName" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none" value="${esc(k.name)}"></div>
      <div><label class="text-[15px] text-stone-500">分类</label>
        <select id="ekCat" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${CATS.map(c => `<option ${c === k.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <button data-action="save-edit-knowledge" data-kid="${kid}" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px] font-medium">保存</button>
    </div>`);
}

/* ============================================================
 * 模块三：课表安排
 * ============================================================ */
function renderTimetable() {
  const d = DataManager.data;
  const allDone = DataManager.completedCount() >= d.meta.totalLessons;
  const cur = DataManager.currentLesson();
  const curWeek = cur ? DataManager.getTimetable(cur.timetableId).week : 2;
  const week = State.timetableWeek || curWeek;
  const weeks = [...new Set(d.timetable.map(t => t.week))].sort((a, b) => a - b);
  const days = Object.keys(DOW_ORDER);
  const byDay = {};
  d.timetable.filter(t => t.week === week).forEach(t => { (byDay[t.day] = byDay[t.day] || []).push(t); });
  const weekItems = d.timetable.filter(t => t.week === week);
  const weekDoable = weekItems.filter(t => !t.cancelled).length;
  const weekCancelled = weekItems.length - weekDoable;
  const body = `
    <button data-action="add-course" class="w-full rounded-xl border border-dashed border-stone-300 py-2.5 text-[15px] text-stone-500">+ 添加课程</button>
    ${allDone ? `<div class="card px-4 py-3 bg-amber-50 border-amber-200 text-amber-700 text-sm font-medium">🎉 全部 ${d.meta.totalLessons} 大节已完成！</div>` : ''}
    <div class="flex flex-wrap gap-1.5">
      ${weeks.map(w => `<button data-action="week-tab" data-week="${w}" style="width:52px" class="h-8 rounded-lg text-[14px] flex items-center justify-center ${w === week ? 'bg-[#37352F] text-white font-medium' : 'bg-white border border-stone-200 text-stone-500'}">第${w}周</button>`).join('')}
    </div>
    <div class="text-[14px] text-stone-500 mt-2 mb-0.5 px-0.5">第${week}周 共${weekDoable}大节${weekCancelled ? ` <span class="text-stone-400">（另有 ${weekCancelled} 大节被冲掉）</span>` : ''}</div>
    ${days.map(day => {
      const ts = (byDay[day] || []).sort((a, b) => a.period - b.period);
      if (!ts.length) return '';
      return `<div><div class="text-[15px] font-semibold text-stone-500 mt-3 mb-1">${day}</div>
        <div class="space-y-1.5">${ts.map(t => {
          const l = DataManager.getLessonByTimetable(t.id);
          const u = l ? DataManager.getUnit(l.unitId) : null;
          const done = !!(l && l.completed);
          return `<div class="w-full card px-3 py-2.5 flex items-center gap-2 ${t.cancelled ? 'bg-stone-50' : ''}">
            <button data-action="open-lesson" data-tid="${t.id}" class="flex-1 min-w-0 text-left">
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 inline-block rounded-full shrink-0 ${t.cancelled ? 'bg-red-400' : done ? 'bg-emerald-500' : 'bg-stone-300'}"></span>
                <span class="text-[16px] font-medium leading-snug">${t.displayName}</span>
              </span>
              <span class="block text-[13px] text-stone-400 mt-0.5">${t.room} · ${t.periods} · ${u ? esc(titleShort(u.title)) : '未开始'}${done ? ' · ✅ ' + fmtDT(l.completedAt) : ''}</span>
              ${t.cancelled ? `<span class="inline-block mt-1 rounded-md bg-red-100 text-red-600 text-[13px] px-2 py-0.5 font-medium">🚫 被冲掉（禁打卡）</span>` : ''}
              ${t.originalNote ? `<span class="block text-[13px] text-amber-600 mt-0.5">📌 ${esc(t.originalNote)}</span>` : ''}
            </button>
            <button data-action="edit-schedule" data-tid="${t.id}" class="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-stone-200 text-stone-400 text-[15px]">✏️</button>
          </div>`;
        }).join('')}</div></div>`;
    }).join('')}`;
  return pageShell('📅 课表安排', body);
}

/* ---- 课程进度表导出（CSV）---- */
const CANCELLED_REASON = { '10.1': '国庆节', '10.6': '国庆节', '10.7': '国庆节', '10.29': '运动会', '10.30': '运动会', '1.1': '元旦' };
function dateFull(week, day) {
  const start = new Date((DataManager.data.meta.semesterStart || '2026-09-07') + 'T00:00:00');
  const d = new Date(start.getTime() + (week - 1) * 7 * 86400000 + (DOW_ORDER[day] - 1) * 86400000);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function scheduleNoteOf(t) {
  if (t.cancelled) return CANCELLED_REASON[dateMD(t.week, t.day)] || '被冲掉';
  if (!t.originalNote) return '';
  if (/^原课程/.test(t.originalNote)) {
    const m = t.originalNote.match(/(\d{1,2}\.\d{1,2})/);
    return '替代' + (m ? m[1] : t.originalNote.replace(/^原课程[:：]\s*/, ''));
  }
  return t.originalNote;
}
function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
function roman(n) {
  const parts = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  return parts.map(([value, symbol]) => { const count = Math.floor(n / value); n %= value; return symbol.repeat(count); }).join('');
}
function buildScheduleProgressCsv() {
  const d = DataManager.data;
  const order = sortedTimetable();
  const groups = [];
  const index = new Map();
  order.forEach(t => {
    const key = t.week + '|' + t.day;
    if (!index.has(key)) { index.set(key, groups.length); groups.push([]); }
    groups[index.get(key)].push(t);
  });
  const rows = [['周次', '日期', '课时数', '教学内容', '作业', '备注', '其他备注']];
  const totalOccurrences = new Map();
  order.forEach(t => {
    const l = DataManager.getLessonByTimetable(t.id);
    if (l) (l.checkedKnowledgeIds || []).forEach(kid => totalOccurrences.set(kid, (totalOccurrences.get(kid) || 0) + 1));
  });
  const occurrence = new Map();
  groups.forEach(g => {
    g.sort((a, b) => a.period - b.period);
    const checkable = g.filter(t => !t.cancelled);
    const content = [];
    const homework = [];
    const memos = [];
    const notes = [];
    g.forEach(t => {
      const l = DataManager.getLessonByTimetable(t.id);
      if (l) {
        const lessonContent = [];
        (l.checkedKnowledgeIds || []).forEach(kid => {
          const k = DataManager.getKnowledge(kid);
          if (k && k.name) {
            const count = (occurrence.get(kid) || 0) + 1;
            occurrence.set(kid, count);
            lessonContent.push(k.name + (totalOccurrences.get(kid) > 1 ? ' ' + roman(count) : ''));
          }
        });
        if (lessonContent.length) content.push('第' + t.period + '大节：' + lessonContent.join('、'));
        (l.homework || []).forEach(h => { if (h && h.content) homework.push('第' + t.period + '大节：' + h.content); });
        (l.memos || []).forEach(m => { if (m.content) memos.push('第' + t.period + '大节：' + m.content); });
      }
      const n = scheduleNoteOf(t);
      if (n) notes.push(n);
    });
    rows.push([
      '第' + g[0].week + '周',
      dateFull(g[0].week, g[0].day),
      checkable.length * 2,
      content.join('；'),
      homework.join('；'),
      [...new Set(notes)].join('；'),
      memos.join('；')
    ]);
  });
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

function openScheduleEditSheet(tid) {
  const t = DataManager.getTimetable(tid);
  if (!t) return;
  const days = Object.keys(DOW_ORDER);
  const hasRecord = !!DataManager.getLessonByTimetable(tid);
  openSheet('课程设置（调课 / 状态）', `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[15px] text-stone-500">周次</label>
          <input id="schWeek" type="number" min="1" max="30" value="${t.week}" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none"></div>
        <div><label class="text-[15px] text-stone-500">星期</label>
          <select id="schDay" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${days.map(d => `<option ${d === t.day ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[15px] text-stone-500">当日第几大节</label>
          <input id="schPeriod" type="number" min="1" max="6" value="${t.period}" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none"></div>
        <div><label class="text-[15px] text-stone-500">节次</label>
          <select id="schSlots" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${['1-2节', '3-4节', '5-6节', '7-8节', '9-10节'].map(x => `<option ${x === t.periods ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      </div>
      <div><label class="text-[15px] text-stone-500">教室</label>
        <input id="schRoom" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none" value="${esc(t.room)}"></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[15px] text-stone-500">状态</label>
          <select id="schStatus" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">
            <option ${!t.cancelled ? 'selected' : ''}>正常</option>
            <option ${t.cancelled ? 'selected' : ''}>被冲掉</option>
          </select></div>
      </div>
      <div><label class="text-[15px] text-stone-500">备注（如"原课程：第3周周五9.25"）</label>
        <input id="schNote" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none" value="${esc(t.originalNote || '')}" placeholder="留空则无备注"></div>
      <div class="text-[14px] text-stone-400">保存后课表按新时间显示并自动算日期；"被冲掉"的课禁打卡、不计入总进度。${hasRecord ? '⚠️ 该课已有打卡记录，不能改为被冲掉。' : ''}</div>
      <button data-action="save-schedule" data-tid="${tid}" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px] font-medium">保存</button>
      ${hasRecord ? '' : `<button data-action="delete-course" data-tid="${tid}" class="w-full rounded-xl border border-red-200 text-red-500 py-3 text-[16px]">删除此课程</button>`}
    </div>`);
}

function openAddCourseSheet() {
  const days = Object.keys(DOW_ORDER);
  openSheet('添加课程', `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[15px] text-stone-500">周次</label>
          <input id="acWeek" type="number" min="1" max="30" value="18" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none"></div>
        <div><label class="text-[15px] text-stone-500">星期</label>
          <select id="acDay" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${days.map(d => `<option>${d}</option>`).join('')}</select></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[15px] text-stone-500">当日第几大节</label>
          <input id="acPeriod" type="number" min="1" max="6" value="1" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none"></div>
        <div><label class="text-[15px] text-stone-500">节次</label>
          <select id="acSlots" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${['1-2节', '3-4节', '5-6节', '7-8节', '9-10节'].map(x => `<option ${x === '3-4节' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      </div>
      <div><label class="text-[15px] text-stone-500">教室</label>
        <input id="acRoom" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none" value="叶耀珍楼407"></div>
      <div><label class="text-[15px] text-stone-500">备注（可写"期末测评"或"原课程：…"）</label>
        <input id="acNote" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none" placeholder="选填"></div>
      <button data-action="save-course" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px] font-medium">添加</button>
    </div>`);
}

function renderLessonDetail() {
  const t = DataManager.getTimetable(State.tid);
  if (!t) { State.view = 'timetable'; return renderTimetable(); }
  const l = DataManager.getLessonByTimetable(t.id);
  const u = l ? DataManager.getUnit(l.unitId) : null;
  const done = !!(l && l.completed);
  const rows = u
    ? u.knowledgeIds.map(kid => {
        const k = DataManager.getKnowledge(kid);
        if (!k) return '';
        const c = l.checkedKnowledgeIds.includes(kid);
        return `<div class="card px-3 py-2 flex items-center gap-2 text-[16px]"><span class="shrink-0">${c ? '☑️' : '⬜️'}</span><span class="tag ${catColor(k.category)} shrink-0">${k.category}</span><span class="min-w-0 ${c ? 'text-stone-400' : ''}">${esc(k.name)}</span></div>`;
      }).join('')
    : `<div class="text-[15px] text-stone-400 px-1">尚未开始（未打卡到此课）</div>`;
  const body = `
    <div class="card px-4 py-3 space-y-1">
      <div class="text-[17px] font-semibold">${t.displayName}</div>
      <div class="text-[15px] text-stone-500">${t.room} · ${t.periods}</div>
      <div class="text-[15px] text-stone-500">${u ? unitAbbr(u) + ' ' + esc(titleShort(u.title)) : '未关联教学项目'}</div>
      ${t.originalNote ? `<div class="text-[15px] text-amber-600">📌 ${esc(t.originalNote)}</div>` : ''}
      <div class="text-[15px] ${t.cancelled ? 'text-red-500 font-medium' : done ? 'text-emerald-600' : 'text-stone-400'}">${t.cancelled ? '🚫 被冲掉（禁打卡）' : done ? '✅ 已打卡 ' + fmtDT(l.completedAt) : '⚪ 未打卡'}</div>
    </div>
    ${t.cancelled ? `<div class="card px-4 py-3 bg-red-50 border-red-200 text-red-600 text-[15px] leading-relaxed">本节因节日 / 活动被冲掉，不参与打卡，也不计入总进度。若学校临时补课，可在课表点 ✏️ 恢复为正常，或另行"添加课程"。</div>` : ''}
    <div class="text-[16px] font-semibold pt-1">知识点完成情况</div>
    <div class="space-y-1.5">${rows}</div>
    ${l && l.memos.length ? `<div class="text-[16px] font-semibold pt-1">课程备注</div>${l.memos.map(m => `<div class="card px-3 py-2 text-[16px]">${esc(m.content)}<div class="text-[13px] text-stone-400 mt-1">${fmtDT(m.createdAt)}</div></div>`).join('')}` : ''}
    ${l && l.homework && l.homework.length ? `<div class="text-[16px] font-semibold pt-1">课后作业</div><div class="space-y-1.5">${l.homework.map(h => `<div class="card px-3 py-2 text-[16px]"><span class="tag ${catColor(h.category)} mr-1">${esc(h.category)}</span>${esc(h.content)}</div>`).join('')}</div>` : ''}
    ${l ? `<button data-action="edit-lesson" data-lesson="${l.id}" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px]">${done ? '修改已打卡课程' : '打开课程打卡'}</button>` : ''}`;
  return pageShell('课程详情', body, { back: 'open-timetable' });
}

/* ============================================================
 * 模块四：知识看板
 * ============================================================ */
function renderBoard() {
  const cat = State.boardCategory || CATS[0];
  const total = DataManager.data.knowledgeItems.length;
  const doneY = DataManager.data.knowledgeItems.filter(k => {
    const u = DataManager.unitOfKnowledge(k.id);
    return u && (u.checkedKnowledgeIds || []).includes(k.id);
  }).length;
  const pracZ = DataManager.data.knowledgeItems.filter(k => k.practices && k.practices.length).length;
  const orderOf = kid => {
    const u = DataManager.unitOfKnowledge(kid);
    return u ? [DataManager.data.syllabus.indexOf(u), u.knowledgeIds.indexOf(kid)] : [999, 999];
  };
  const items = DataManager.data.knowledgeItems.filter(k => k.category === cat).sort((a, b) => {
    const x = orderOf(a.id), y = orderOf(b.id);
    return x[0] - y[0] || x[1] - y[1];
  }).map(k => {
    const u = DataManager.unitOfKnowledge(k.id);
    const c = u && (u.checkedKnowledgeIds || []).includes(k.id);
    return `
      <div class="card px-3 py-2.5 flex items-center gap-2">
        <span class="shrink-0">${c ? '🟢' : '⚪'}</span>
        <span class="flex-1 min-w-0 text-[16px] ${c ? 'text-stone-400' : ''}">${esc(k.name)}</span>
        <span class="text-[14px] text-stone-400 shrink-0">${u ? unitAbbr(u) : ''}</span>
        ${k.practices && k.practices.length ? `<button data-action="view-practices" data-kid="${k.id}" class="text-[15px] shrink-0">📝</button>` : ''}
      </div>`;
  }).join('');
  return pageShell('📊 知识看板', `
    <div class="card px-4 py-3 text-[15px] text-stone-500">📊 知识看板 · 总数 <b class="text-[#37352F]">${total}</b> · 已完成 <b class="text-emerald-600">${doneY}</b> · 练习 <b class="text-amber-600">${pracZ}</b></div>
    <div class="flex flex-wrap gap-1.5">${CATS.map(c => `<button data-action="board-cat" data-cat="${c}" class="px-3 py-1.5 rounded-full text-[14px] ${c === cat ? 'bg-[#37352F] text-white' : 'bg-white border border-stone-200 text-stone-500'}">${c}</button>`).join('')}</div>
    <div class="space-y-1.5">${items || '<div class="text-[15px] text-stone-400 px-1">暂无知识点</div>'}</div>`);
}

/* ============================================================
 * 模块五：备注汇总
 * ============================================================ */
function collectNotes() {
  const out = [];
  DataManager.data.lessons.forEach(l => {
    const t = DataManager.getTimetable(l.timetableId);
    const u = DataManager.getUnit(l.unitId);
    const lab = u ? `[${unitAbbr(u)}-${titleShort(u.title)}` : '[';
    (l.memos || []).forEach(m => out.push({ ts: m.createdAt, date: fmtDateCN(m.createdAt), group: t ? t.displayName : '', label: lab + ' 课程备注]', text: m.content, kind: 'memo' }));
    (l.homework || []).forEach(h => out.push({ ts: h.timestamp, date: fmtDateCN(h.timestamp), group: t ? t.displayName : '', label: lab + ' 作业备注]', text: h.content, kind: 'hw' }));
  });
  DataManager.data.knowledgeItems.forEach(k => (k.practices || []).forEach(p => {
    out.push({ ts: p.timestamp, date: fmtDateCN(p.timestamp), group: '', label: `[${k.category}-${titleShort(k.name)} 练习]`, text: p.note || '（已布置练习）', kind: 'practice' });
  }));
  out.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return out;
}
function groupedNotesText() {
  const dates = new Map();
  collectNotes().forEach(n => {
    if (!dates.has(n.date)) dates.set(n.date, []);
    dates.get(n.date).push(n);
  });
  return [...dates].map(([date, entries]) => {
    const sections = [['memo', '课程备注'], ['hw', '作业备注'], ['practice', '练习记录']]
      .map(([kind, title]) => {
        const lines = entries.filter(n => n.kind === kind).map(n => `- ${fmtTime(n.ts)} ${n.group} ${n.label} ${n.text}`);
        return lines.length ? title + '\n' + lines.join('\n') : '';
      }).filter(Boolean);
    return date + '\n' + sections.join('\n\n');
  }).join('\n\n');
}
function renderNotes() {
  const notes = collectNotes();
  const groups = {};
  notes.forEach(n => { (groups[n.date] = groups[n.date] || []).push(n); });
  const body = Object.keys(groups).map(key => `
    <div>
      <div class="text-[15px] font-semibold text-stone-500 mt-2 mb-1">${esc(key)}</div>
      ${[['memo', '课程备注'], ['hw', '作业备注'], ['practice', '练习记录']].map(([kind, title]) => {
        const entries = groups[key].filter(n => n.kind === kind);
        return entries.length ? `<div class="text-[14px] font-medium text-stone-500 mt-2 mb-1">${title}</div><div class="space-y-1.5">${entries.map(n => `
        <div class="card px-3 py-2 text-[16px] leading-snug">
          <span class="text-[13px] text-stone-400 mr-1">${fmtTime(n.ts)}</span>
          <span class="text-[13px] text-stone-500">${esc(n.group)}</span>
          <span class="tag ${n.kind === 'memo' ? 'bg-blue-100 text-blue-700' : n.kind === 'hw' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${esc(n.label)}</span>
          <span class="block mt-1">${esc(n.text)}</span>
        </div>`).join('')}</div>` : '';
      }).join('')}
    </div>`).join('');
  return pageShell('📝 备注汇总', body || '<div class="text-[15px] text-stone-400 px-1">暂无备注</div>', {
    right: `<button data-action="export-notes" class="text-[14px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">📋 导出全部</button>`
  });
}

/* ============================================================
 * 模块六：学生档案
 * ============================================================ */
function renderStudents() {
  const all = DataManager.data.students;
  const rows = all.map(s => {
    const last = [...(s.records || [])].reverse().find(r => r.type === 'evaluation');
    const issue = last && last.coreIssues && last.coreIssues.length ? last.coreIssues.join('、') : '-';
    const evEmoji = last && last.evaluation ? (EVAL_EMOJI[last.evaluation] || '') : '';
    const sel = State.selectedStudents.has(s.id);
    return `
      <div class="card px-3 py-2.5 flex items-center gap-2">
        <input type="checkbox" data-action="select-student" data-sid="${s.id}" ${sel ? 'checked' : ''} class="w-5 h-5 accent-[#37352F] shrink-0">
        <button data-action="open-student" data-sid="${s.id}" class="flex-1 min-w-0 text-left">
          <span class="block text-[16px] font-medium">${esc(s.name)}${evEmoji ? ` <span class="text-[14px]">${evEmoji}</span>` : ''}</span>
          <span class="block text-[13px] text-stone-400">${esc(s.studentNo)} · 最新问题：${esc(issue)}</span>
        </button>
        <button data-action="edit-student" data-sid="${s.id}" class="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-stone-200 text-stone-400 text-[15px]">✏️</button>
        <button data-action="delete-student" data-sid="${s.id}" class="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-stone-200 text-stone-400 text-[15px]">🗑️</button>
      </div>`;
  }).join('');
  const selN = State.selectedStudents.size;
  return pageShell('👨‍🎓 学生档案', `
    <button data-action="add-student" class="w-full rounded-xl border border-dashed border-stone-300 py-2.5 text-[15px] text-stone-500">＋ 添加学生</button>
    <div class="flex items-center justify-between">
      <label class="flex items-center gap-2 text-[15px] text-stone-500"><input type="checkbox" data-action="select-all" ${selN === all.length ? 'checked' : ''} class="w-5 h-5 accent-[#37352F]"> ☑ 全选（${selN}/${all.length}）</label>
      <button data-action="export-students" class="text-[14px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">📤 导出选中</button>
    </div>
    <div class="space-y-1.5">${rows}</div>`, { right: '' });
}

function openStudentFormSheet(sid) {
  const s = sid ? DataManager.data.students.find(x => x.id === sid) : null;
  openSheet(s ? '编辑学生' : '添加学生', `
    <div class="space-y-3">
      <div><label class="text-[15px] text-stone-500">学号</label>
        <input id="stuNo" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none focus:border-stone-400" placeholder="请补全后两位，如 01" value="${s ? esc(s.studentNo) : '26114500'}"></div>
      <div><label class="text-[15px] text-stone-500">姓名</label>
        <input id="stuName" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none focus:border-stone-400" placeholder="学生姓名" value="${s ? esc(s.name) : ''}"></div>
      <button data-action="save-student" data-sid="${sid || ''}" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px] font-medium">保存</button>
    </div>`);
}

function studentUI() {
  if (!State.studentUI) State.studentUI = { evaluation: null, issues: new Set(), tags: new Set(), status: null, memo: '' };
  return State.studentUI;
}
function syncStudentInputs() {
  const ui = State.studentUI;
  if (!ui) return;
  const m = $('#quickMemo'); if (m) ui.memo = m.value;
  const ni = $('#newIssue'); if (ni && ni.value.trim()) ui.newIssue = ni.value.trim();
  const nt = $('#newTag'); if (nt && nt.value.trim()) ui.newTag = nt.value.trim();
}
function weekOfDate(d) {
  const start = new Date(DataManager.data.meta.semesterStart + 'T00:00:00');
  const diff = Math.floor((d - start) / 86400000);
  return diff < 0 ? 0 : Math.floor(diff / 7) + 1;
}

function renderStudentDetail() {
  const s = DataManager.data.students.find(x => x.id === State.studentId);
  if (!s) { State.view = 'students'; return renderStudents(); }
  const ui = studentUI();
  const tl = [...(s.records || [])].reverse().map(r => {
    const d = new Date(r.timestamp);
    const w = weekOfDate(d);
    if (r.type === 'evaluation') {
      return `<div class="card px-3 py-2 text-[15px] leading-relaxed">${fmtDateCN(r.timestamp)}（第${w}周）｜总体评价：${r.evaluation || '未填'}｜核心问题：${(r.coreIssues || []).join('、') || '未填'}</div>`;
    }
    return `<div class="card px-3 py-2 text-[15px] leading-relaxed">${fmtDateCN(r.timestamp)}（第${w}周）｜标签：${(r.tags || []).join('、') || '未填'}｜状态：${r.status || '未填'}｜备忘：${r.memo || '未填'}</div>`;
  }).join('');
  const issues = DataManager.data.meta.coreIssueOptions || [];
  const tags = DataManager.data.meta.customTags || [];
  const chip = (val, set, action) => `<button data-action="${action}" data-val="${val}" class="px-2.5 py-1 rounded-full text-[14px] border ${set.has(val) ? 'border-[#37352F] bg-[#F0EEE9] font-medium' : 'border-stone-200'}">${esc(val)}</button>`;
  return pageShell(`${esc(s.name)} <span class="text-[14px] text-stone-400 font-normal">${esc(s.studentNo)}</span>`, `
    <div class="card px-4 py-3">
      <div class="text-[16px] font-semibold mb-2">📊 总体评价 + 核心问题</div>
      <div class="flex gap-2 mb-3">${[['🟢', '头部'], ['🟡', '中等'], ['🔴', '末尾']].map(([e, l]) => `<button data-action="set-evaluation" data-val="${l}" class="flex-1 py-2 rounded-xl border text-[15px] ${ui.evaluation === l ? 'border-[#37352F] bg-[#F0EEE9] font-medium' : 'border-stone-200'}">${e} ${l}</button>`).join('')}</div>
      <div class="flex flex-wrap gap-1.5 mb-2">${issues.map(o => chip(o, ui.issues, 'toggle-issue')).join('')}</div>
      <div class="flex gap-2 mb-3"><input id="newIssue" class="flex-1 min-w-0 rounded-xl border border-stone-200 px-3 py-2 text-[15px] focus:outline-none" placeholder="+ 新增问题"><button data-action="add-issue" class="shrink-0 rounded-xl border border-stone-200 px-3 text-[15px]">添加</button></div>
      <button data-action="submit-evaluation" class="w-full rounded-xl bg-[#37352F] text-white py-2.5 text-[15px] font-medium">提交记录</button>
    </div>
    <div class="card px-4 py-3">
      <div class="text-[16px] font-semibold mb-2">⚡ 快速记录</div>
      <div class="flex flex-wrap gap-1.5 mb-2">${tags.map(t => chip(t, ui.tags, 'toggle-tag')).join('')}</div>
      <div class="flex gap-2 mb-2"><input id="newTag" class="flex-1 min-w-0 rounded-xl border border-stone-200 px-3 py-2 text-[15px] focus:outline-none" placeholder="+ 新标签"><button data-action="add-tag" class="shrink-0 rounded-xl border border-stone-200 px-3 text-[15px]">添加</button></div>
      <div class="flex gap-2 mb-2">${[['🔴', '待巩固'], ['🟡', '观察中'], ['🟢', '已攻克']].map(([e, l]) => `<button data-action="set-status" data-val="${l}" class="flex-1 py-2 rounded-xl border text-[15px] ${ui.status === l ? 'border-[#37352F] bg-[#F0EEE9] font-medium' : 'border-stone-200'}">${e} ${l}</button>`).join('')}</div>
      <input id="quickMemo" class="w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] mb-2 focus:outline-none" placeholder="1行备忘" value="${esc(ui.memo || '')}">
      <button data-action="save-quick" class="w-full rounded-xl bg-[#37352F] text-white py-2.5 text-[15px] font-medium">保存</button>
    </div>
    <div class="text-[16px] font-semibold pt-1">📜 问题演变时间轴</div>
    <div class="space-y-1.5">${tl || '<div class="text-[15px] text-stone-400 px-1">暂无记录</div>'}</div>`,
    { back: 'open-students' });
}

function buildExport(format) {
  const sel = State.selectedStudents.size
    ? DataManager.data.students.filter(s => State.selectedStudents.has(s.id))
    : DataManager.data.students;
  if (format === 'md') {
    let md = `# 学生档案导出 - ${fmtDT(new Date().toISOString()).slice(0, 10)}\n\n`;
    sel.forEach(s => {
      md += `## ${s.name}（${s.studentNo}）\n`;
      const lastEval = [...(s.records || [])].reverse().find(r => r.type === 'evaluation');
      if (lastEval) {
        md += `- **总体评价**：${lastEval.evaluation || '（未填）'}\n`;
        md += `- **核心问题**：${(lastEval.coreIssues || []).join('、') || '（未填）'}\n`;
      }
      md += `\n### 记录时间轴\n`;
      [...(s.records || [])].reverse().forEach(r => {
        if (r.type === 'evaluation') md += `- ${fmtDT(r.timestamp)}｜总体评价：${r.evaluation || '未填'}｜核心问题：${(r.coreIssues || []).join('、') || '未填'}\n`;
        else md += `- ${fmtDT(r.timestamp)}｜标签：${(r.tags || []).join('、') || '未填'}｜状态：${r.status || '未填'}｜备忘：${r.memo || '未填'}\n`;
      });
      md += '\n';
    });
    return md;
  }
  return sel.map(s => JSON.stringify({
    name: s.name, studentNo: s.studentNo,
    records: (s.records || []).map(r => Object.assign(
      { date: fmtDT(r.timestamp) },
      r.type === 'evaluation'
        ? { type: 'evaluation', evaluation: r.evaluation, coreIssues: r.coreIssues }
        : { type: 'quick', tags: r.tags, status: r.status, memo: r.memo }
    ))
  })).join('\n');
}

/* ============================================================
 * 作业/练习弹窗
 * ============================================================ */
function openHomeworkSheet(presetCat, lessonId, kidId, homework) {
  openSheet(homework ? '编辑作业/练习' : '添加作业/练习', `
    <div class="space-y-3">
      <div><label class="text-[15px] text-stone-500">分类</label>
        <select id="hwCat" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${CATS.map(c => `<option ${c === presetCat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label class="text-[15px] text-stone-500">内容</label>
        <textarea id="hwContent" rows="2" class="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px] focus:outline-none focus:border-stone-400" placeholder="作业/练习内容">${esc(homework ? homework.content : '')}</textarea></div>
      <button data-action="save-homework" data-lesson="${lessonId}" data-kid="${kidId || ''}" data-hid="${homework ? homework.id : ''}" class="w-full rounded-xl bg-[#37352F] text-white py-3 text-[16px] font-medium">保存</button>
    </div>`);
}

/* ============================================================
 * 动作处理（事件委托）
 * ============================================================ */
function handleAction(action, el) {
  const d = DataManager.data;
  switch (action) {
    case 'open-sidebar': $('#drawer').classList.add('open'); $('#overlay').classList.add('open'); break;
    case 'close-sidebar': $('#drawer').classList.remove('open'); $('#overlay').classList.remove('open'); break;
    case 'nav':
      State.view = el.dataset.view; State.lessonId = null; State.unitId = null; State.tid = null;
      State.timetableWeek = null; State.studentId = null; State.studentUI = null; State.boardCategory = CATS[0];
      $('#drawer').classList.remove('open'); $('#overlay').classList.remove('open');
      renderApp(); break;

    /* ---- 教学进度 ---- */
    case 'prev-lesson': {
      const cur = DataManager.currentLesson();
      const arr = checkableList();
      let i = arr.findIndex(x => x.id === cur.timetableId);
      while (i > 0) {
        i -= 1;
        const prev = DataManager.getLessonByTimetable(arr[i].id);
        if (prev) { State.lessonId = prev.id; renderApp(); break; }
      }
      break;
    }
    case 'goto-current': State.lessonId = null; renderApp(); break;
    case 'toggle-knowledge': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      if (!lesson) break;
      const kid = el.dataset.kid;
      const i = lesson.checkedKnowledgeIds.indexOf(kid);
      if (i >= 0) lesson.checkedKnowledgeIds.splice(i, 1); else lesson.checkedKnowledgeIds.push(kid);
      DataManager.recomputeUnitProgress(); DataManager.save(); renderApp(); break;
    }
    case 'add-hw-knowledge': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      const k = DataManager.getKnowledge(el.dataset.kid);
      if (lesson && k) openHomeworkSheet(k.category, lesson.id, k.id);
      break;
    }
    case 'save-memo': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      if (!lesson) break;
      const v = $('#memoInput').value.trim();
      if (!v) { toast('请填写备注'); break; }
      lesson.memos.push({ id: uid('m'), content: v, createdAt: new Date().toISOString() });
      DataManager.save(); renderApp(); toast('备注已保存'); break;
    }
    case 'edit-memo': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      const memo = lesson && lesson.memos.find(m => m.id === el.dataset.memo);
      if (!memo) break;
      openSheet('编辑课程备注', `<textarea id="editMemoInput" rows="4" class="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[16px]">${esc(memo.content)}</textarea><button data-action="update-memo" data-lesson="${lesson.id}" data-memo="${memo.id}" class="w-full mt-3 rounded-xl bg-[#37352F] text-white py-3">保存修改</button>`);
      break;
    }
    case 'update-memo': {
      const lesson = DataManager.getLessonById(el.dataset.lesson);
      const memo = lesson && lesson.memos.find(m => m.id === el.dataset.memo);
      const v = $('#editMemoInput').value.trim();
      if (!memo || !v) { toast('请填写备注'); break; }
      memo.content = v; memo.updatedAt = new Date().toISOString();
      DataManager.save(); closeSheet(); renderApp(); toast('备注已修改'); break;
    }
    case 'add-homework': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      if (lesson) openHomeworkSheet('', lesson.id, '');
      break;
    }
    case 'edit-homework': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      const hw = lesson && lesson.homework.find(h => h.id === el.dataset.hid);
      if (hw) openHomeworkSheet(hw.category, lesson.id, hw.knowledgeId || '', hw);
      break;
    }
    case 'delete-homework': {
      const lesson = DataManager.getLessonById(State.lessonId || d.meta.currentLessonId);
      const hw = lesson && lesson.homework.find(h => h.id === el.dataset.hid);
      if (!hw || !confirm('确定删除这条作业吗？')) break;
      lesson.homework = lesson.homework.filter(h => h.id !== hw.id);
      if (hw.knowledgeId && hw.practiceId) {
        const k = DataManager.getKnowledge(hw.knowledgeId);
        if (k) k.practices = (k.practices || []).filter(p => p.id !== hw.practiceId);
      }
      DataManager.save(); renderApp(); toast('作业已删除'); break;
    }
    case 'save-homework': {
      const cat = $('#hwCat').value, content = $('#hwContent').value.trim();
      const lesson = DataManager.getLessonById(el.dataset.lesson);
      if (!lesson) break;
      const kid = el.dataset.kid || '';
      if (!kid && !content) { toast('请填写作业内容'); break; }
      const ts = new Date().toISOString();
      const existing = lesson.homework.find(h => h.id === el.dataset.hid);
      if (existing) { existing.category = cat; existing.content = content || '（练习）'; }
      else {
        const practiceId = kid ? uid('p') : '';
        lesson.homework.push({ id: uid('h'), category: cat, content: content || '（练习）', timestamp: ts, knowledgeId: kid, practiceId });
        if (kid) {
          const k = DataManager.getKnowledge(kid);
          if (k) k.practices.push({ id: practiceId, timestamp: ts, note: content || '已布置练习' });
        }
      }
      if (existing && existing.knowledgeId && existing.practiceId) {
        const k = DataManager.getKnowledge(existing.knowledgeId);
        const p = k && (k.practices || []).find(x => x.id === existing.practiceId);
        if (p) p.note = existing.content;
      }
      DataManager.save(); closeSheet(); renderApp(); toast('已保存'); break;
    }
    case 'complete-lesson': {
      const lesson = DataManager.currentLesson();
      if (!lesson || lesson.completed) break;
      lesson.completed = true; lesson.completedAt = new Date().toISOString();
      const unit = DataManager.getUnit(lesson.unitId);
      DataManager.recomputeUnitProgress();
      const nextT = nextTimetableAfter(lesson.timetableId);
      if (nextT) {
        let next = DataManager.getLessonByTimetable(nextT.id);
        if (!next) {
          next = { id: uid('l'), timetableId: nextT.id, unitId: presetUnitFor(nextT) || unit.id, checkedKnowledgeIds: [], completed: false, completedAt: null, memos: [], homework: [] };
          d.lessons.push(next);
        }
        d.meta.currentLessonId = next.id;
      }
      DataManager.save();
      State.lessonId = null;
      if (!nextT) { State.view = 'timetable'; State.timetableWeek = null; }
      renderApp();
      if (nextT) toast('✅ 打卡成功，已进入下一课'); else toast('🎉 本学期课程全部完成！');
      break;
    }

    /* ---- 教学大纲 ---- */
    case 'open-unit': State.unitId = el.dataset.unit; State.view = 'syllabusDetail'; renderApp(); break;
    case 'open-syllabus': State.view = 'syllabus'; State.unitId = null; renderApp(); break;
    case 'open-add-knowledge': openAddKnowledgeSheet(); break;
    case 'new-knowledge': openNewKnowledgeSheet(); break;
    case 'save-new-knowledge': {
      const name = $('#nkName').value.trim();
      if (!name) { toast('请填写知识点名称'); break; }
      const item = { id: uid('k'), name: name, category: $('#nkCat').value, practices: [] };
      d.knowledgeItems.push(item);
      const unit = DataManager.getUnit(State.unitId);
      unit.knowledgeIds.push(item.id);
      DataManager.recomputeUnitProgress(); DataManager.save(); closeSheet(); renderApp(); toast('已新建知识点'); break;
    }
    case 'pick-knowledge': {
      const unit = DataManager.getUnit(State.unitId);
      const kid = el.dataset.kid;
      if (unit && !unit.knowledgeIds.includes(kid)) unit.knowledgeIds.push(kid);
      DataManager.recomputeUnitProgress(); DataManager.save(); closeSheet(); renderApp(); break;
    }
    case 'edit-knowledge': openEditKnowledgeSheet(el.dataset.kid); break;
    case 'save-edit-knowledge': {
      const k = DataManager.getKnowledge(el.dataset.kid);
      if (!k) break;
      k.name = $('#ekName').value.trim() || k.name;
      k.category = $('#ekCat').value;
      DataManager.save(); closeSheet(); renderApp(); toast('已保存'); break;
    }
    case 'unlink-knowledge': {
      const unit = DataManager.getUnit(el.dataset.unit);
      const kid = el.dataset.kid;
      if (unit && confirm('确定将该知识点从本项目移除吗？（不会删除全局知识点库）')) {
        unit.knowledgeIds = unit.knowledgeIds.filter(x => x !== kid);
        unit.checkedKnowledgeIds = (unit.checkedKnowledgeIds || []).filter(x => x !== kid);
        DataManager.recomputeUnitProgress(); DataManager.save(); renderApp(); toast('已移除关联');
      }
      break;
    }

    /* ---- 课表 ---- */
    case 'week-tab': State.timetableWeek = +el.dataset.week; renderApp(); break;
    case 'open-lesson': State.tid = el.dataset.tid; State.view = 'lessonDetail'; renderApp(); break;
    case 'edit-lesson': State.lessonId = el.dataset.lesson; State.view = 'progress'; renderApp(); break;
    case 'open-timetable': State.view = 'timetable'; State.tid = null; renderApp(); break;
    case 'edit-schedule': openScheduleEditSheet(el.dataset.tid); break;
    case 'save-schedule': {
      const t = DataManager.getTimetable(el.dataset.tid);
      if (!t) break;
      const week = parseInt($('#schWeek').value, 10);
      const day = $('#schDay').value;
      const period = parseInt($('#schPeriod').value, 10);
      const slots = $('#schSlots').value;
      const room = $('#schRoom').value.trim() || t.room;
      const status = $('#schStatus').value;
      const note = $('#schNote').value.trim();
      if (!(week >= 1 && week <= 30) || !(period >= 1 && period <= 6)) { toast('请检查周次和大节'); break; }
      const wantCancel = status === '被冲掉';
      if (wantCancel && DataManager.getLessonByTimetable(t.id)) { toast('该课已有打卡记录，不能设为被冲掉'); break; }
      t.week = week; t.day = day; t.period = period; t.periods = slots; t.room = room;
      t.cancelled = wantCancel;
      t.originalNote = note || null;
      t.displayName = '第' + week + '周' + day + '(' + dateMD(week, day) + ') 第' + period + '大节';
      DataManager.recalc(); DataManager.save(); closeSheet(); renderApp(); toast('已保存'); break;
    }
    case 'add-course': openAddCourseSheet(); break;
    case 'save-course': {
      const week = parseInt($('#acWeek').value, 10);
      const day = $('#acDay').value;
      const period = parseInt($('#acPeriod').value, 10);
      const slots = $('#acSlots').value;
      const room = $('#acRoom').value.trim() || '叶耀珍楼407';
      const note = $('#acNote').value.trim();
      if (!(week >= 1 && week <= 30) || !(period >= 1 && period <= 6)) { toast('请检查周次和大节'); break; }
      const item = { id: uid('t'), week: week, day: day, period: period,
        displayName: '第' + week + '周' + day + '(' + dateMD(week, day) + ') 第' + period + '大节',
        room: room, periods: slots, cancelled: false, originalNote: note || null };
      DataManager.data.timetable.push(item);
      DataManager.recalc(); DataManager.save(); closeSheet(); renderApp(); toast('已添加课程'); break;
    }
    case 'delete-course': {
      const t = DataManager.getTimetable(el.dataset.tid);
      if (!t) break;
      if (DataManager.getLessonByTimetable(t.id)) { toast('该课已有记录，不能删除；可改为被冲掉'); break; }
      if (confirm('确定删除这一课程吗？（该课还没有打卡记录）')) {
        DataManager.data.timetable = DataManager.data.timetable.filter(x => x.id !== t.id);
        DataManager.recalc(); DataManager.save(); renderApp(); toast('已删除');
      }
      break;
    }

    /* ---- 知识看板 ---- */
    case 'board-cat': State.boardCategory = el.dataset.cat; renderApp(); break;
    case 'view-practices': {
      const k = DataManager.getKnowledge(el.dataset.kid);
      if (!k) break;
      openSheet('练习记录 · ' + titleShort(k.name), (k.practices || []).map(p => `
        <div class="card px-3 py-2 text-[16px]"><span class="text-[13px] text-stone-400">${fmtDT(p.timestamp)}</span><div class="mt-0.5">${esc(p.note || '（无备注）')}</div></div>`).join('') || '<div class="text-[15px] text-stone-400">暂无练习记录</div>');
      break;
    }

    /* ---- 备注汇总 ---- */
    case 'export-notes': {
      const txt = groupedNotesText();
      const done = () => toast('已复制到剪贴板');
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败'); }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(fallback);
      else fallback();
      break;
    }

    /* ---- 学生档案 ---- */
    case 'add-student': openStudentFormSheet(''); break;
    case 'edit-student': openStudentFormSheet(el.dataset.sid); break;
    case 'save-student': {
      const no = $('#stuNo').value.trim(), name = $('#stuName').value.trim();
      if (!no || !name) { toast('请填写学号和姓名'); break; }
      const sid = el.dataset.sid;
      if (sid) {
        const s = d.students.find(x => x.id === sid);
        if (s) { s.studentNo = no; s.name = name; }
      } else {
        d.students.push({ id: uid('s'), studentNo: no, name: name, records: [] });
      }
      DataManager.save(); closeSheet(); renderApp(); toast(sid ? '学生信息已更新' : '已添加学生'); break;
    }
    case 'delete-student': {
      const sid = el.dataset.sid;
      if (confirm('确定删除该学生吗？其全部档案记录将一并删除，不可恢复。')) {
        d.students = d.students.filter(x => x.id !== sid);
        State.selectedStudents.delete(sid);
        if (State.studentId === sid) { State.studentId = null; State.studentUI = null; State.view = 'students'; }
        DataManager.save(); renderApp(); toast('已删除');
      }
      break;
    }
    case 'open-student': State.studentId = el.dataset.sid; State.studentUI = null; State.view = 'studentDetail'; renderApp(); break;
    case 'open-students': State.view = 'students'; State.studentId = null; renderApp(); break;
    case 'export-students':
      openSheet('导出选中学生', `
        <div class="space-y-2">
          <button data-action="do-export-md" class="w-full rounded-xl border border-stone-200 py-3 text-[16px]">Markdown（便于阅读）</button>
          <button data-action="do-export-jsonl" class="w-full rounded-xl border border-stone-200 py-3 text-[16px]">JSONL（便于AI分析）</button>
          <div class="text-[14px] text-stone-400 pt-1">未勾选任何学生时默认导出全部。</div>
        </div>`);
      break;
    case 'do-export-md': {
      const txt = buildExport('md');
      downloadText('学生档案_' + new Date().toISOString().slice(0, 10) + '.md', txt, 'text/markdown;charset=utf-8');
      closeSheet(); toast('已导出 Markdown'); break;
    }
    case 'do-export-jsonl': {
      const txt = buildExport('jsonl');
      downloadText('学生档案_' + new Date().toISOString().slice(0, 10) + '.jsonl', txt, 'application/jsonl;charset=utf-8');
      closeSheet(); toast('已导出 JSONL'); break;
    }
    case 'set-evaluation': syncStudentInputs(); studentUI().evaluation = el.dataset.val; renderApp(); break;
    case 'toggle-issue': {
      syncStudentInputs(); const ui = studentUI(); const v = el.dataset.val;
      if (ui.issues.has(v)) ui.issues.delete(v); else ui.issues.add(v);
      renderApp(); break;
    }
    case 'add-issue': {
      syncStudentInputs(); const ui = studentUI(); const v = ui.newIssue || '';
      if (v && !(d.meta.coreIssueOptions || []).includes(v)) d.meta.coreIssueOptions.push(v);
      if (v) ui.issues.add(v);
      ui.newIssue = ''; DataManager.save(); renderApp(); break;
    }
    case 'submit-evaluation': {
      syncStudentInputs(); const ui = studentUI();
      const s = d.students.find(x => x.id === State.studentId);
      if (!s) break;
      if (!ui.evaluation && ui.issues.size === 0) { toast('请至少选择总体评价或核心问题'); break; }
      s.records.push({ type: 'evaluation', evaluation: ui.evaluation, coreIssues: [...ui.issues], timestamp: new Date().toISOString() });
      State.studentUI = null; DataManager.save(); renderApp(); toast('已记录'); break;
    }
    case 'toggle-tag': {
      syncStudentInputs(); const ui = studentUI(); const v = el.dataset.val;
      if (ui.tags.has(v)) ui.tags.delete(v); else ui.tags.add(v);
      renderApp(); break;
    }
    case 'add-tag': {
      syncStudentInputs(); const ui = studentUI(); const v = ui.newTag || '';
      if (v && !(d.meta.customTags || []).includes(v)) d.meta.customTags.push(v);
      if (v) ui.tags.add(v);
      ui.newTag = ''; DataManager.save(); renderApp(); break;
    }
    case 'set-status': syncStudentInputs(); studentUI().status = el.dataset.val; renderApp(); break;
    case 'save-quick': {
      syncStudentInputs(); const ui = studentUI();
      const s = d.students.find(x => x.id === State.studentId);
      if (!s) break;
      if (ui.tags.size === 0 && !ui.status && !(ui.memo || '').trim()) { toast('请至少填写一项'); break; }
      s.records.push({ type: 'quick', tags: [...ui.tags], status: ui.status, memo: (ui.memo || '').trim(), timestamp: new Date().toISOString() });
      State.studentUI = null; DataManager.save(); renderApp(); toast('已保存'); break;
    }

    /* ---- 课程进度表导出 ---- */
    case 'export-progress-csv': {
      downloadText('课程进度表_2026-2027.csv', buildScheduleProgressCsv(), 'text/csv;charset=utf-8');
      toast('课程进度表已导出');
      break;
    }

    /* ---- 备份/恢复 ---- */
    case 'backup-export': {
      const blob = new Blob([JSON.stringify(DataManager.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '教学备份_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
      toast('备份已导出');
      break;
    }
    case 'backup-import': $('#importFile').click(); break;
    case 'clear-data':
      openSheet('清空数据', `
        <div class="text-[15px] text-stone-500 leading-relaxed">此操作将<b class="text-red-500">永久删除</b>全部打卡记录、备注、作业、学生档案与设置，并恢复为全新初始状态，<b>不可恢复</b>。</div>
        <div class="text-[14px] text-stone-400 mt-1">建议先点击侧边栏"💾 导出备份"保存一份再清空。</div>
        <div class="flex gap-2 mt-4">
          <button data-action="close-sheet" class="flex-1 rounded-xl border border-stone-200 py-3 text-[15px]">取消</button>
          <button data-action="clear-data-confirm" class="flex-1 rounded-xl bg-red-500 text-white py-3 text-[15px] font-medium">我已知晓，继续</button>
        </div>`);
      break;
    case 'clear-data-confirm':
      if (confirm('再次确认：确定清空全部数据吗？此操作不可撤销。')) {
        localStorage.removeItem(STORAGE_KEY);
        DataManager.data = null;
        DataManager.load();
        DataManager.save();
        State.lessonId = null; State.unitId = null; State.tid = null; State.timetableWeek = null;
        State.studentId = null; State.studentUI = null; State.selectedStudents = new Set(); State.boardCategory = CATS[0];
        closeSheet(); renderApp(); toast('数据已清空，已恢复初始状态');
      }
      break;
    case 'close-sheet': closeSheet(); break;
  }
}

/* ============================================================
 * 事件绑定
 * ============================================================ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  handleAction(el.dataset.action, el);
});
let sidebarTouch = null;
document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || $('#sheet')) return;
  const touch = e.touches[0];
  const drawerOpen = $('#drawer') && $('#drawer').classList.contains('open');
  if (drawerOpen || (touch.clientX >= 24 && touch.clientX <= 70)) {
    sidebarTouch = { x: touch.clientX, y: touch.clientY, open: drawerOpen };
  }
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!sidebarTouch || !e.changedTouches.length) return;
  const dx = e.changedTouches[0].clientX - sidebarTouch.x;
  const dy = e.changedTouches[0].clientY - sidebarTouch.y;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (sidebarTouch.open && dx < 0) handleAction('close-sidebar');
    else if (!sidebarTouch.open && dx > 0) handleAction('open-sidebar');
  }
  sidebarTouch = null;
}, { passive: true });
document.addEventListener('change', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'unit-change') {
    const lesson = DataManager.getLessonById(el.dataset.lesson);
    if (lesson && !lesson.completed) {
      lesson.unitId = el.value;
      lesson.checkedKnowledgeIds = [];
      DataManager.save(); renderApp();
    }
  } else if (action === 'select-student') {
    const sid = el.dataset.sid;
    if (e.target.checked) State.selectedStudents.add(sid); else State.selectedStudents.delete(sid);
    renderApp();
  } else if (action === 'select-all') {
    if (e.target.checked) DataManager.data.students.forEach(s => State.selectedStudents.add(s.id));
    else State.selectedStudents.clear();
    renderApp();
  }
});
$('#importFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.timetable || !data.syllabus) throw new Error('bad format');
      const isFullBackup = Array.isArray(data.lessons) && Array.isArray(data.students) && data.meta;
      if (isFullBackup) {
        // 完整备份：整体恢复
        DataManager.data = data;
      } else {
        // 更新包：仅替换基础数据（课表/大纲/知识点），保留课程打卡与学生记录
        DataManager.data.timetable = data.timetable;
        DataManager.data.syllabus = data.syllabus;
        DataManager.data.knowledgeItems = data.knowledgeItems;
        const kIds = new Set(data.knowledgeItems.map(k => k.id));
        DataManager.data.syllabus.forEach(u => {
          u.knowledgeIds = (u.knowledgeIds || []).filter(id => kIds.has(id));
          u.checkedKnowledgeIds = (u.checkedKnowledgeIds || []).filter(id => kIds.has(id));
        });
        DataManager.data.lessons.forEach(l => { l.checkedKnowledgeIds = (l.checkedKnowledgeIds || []).filter(id => kIds.has(id)); });
      }
      DataManager.ensure();
      DataManager.save();
      State.lessonId = null; State.unitId = null; State.tid = null; State.studentId = null; State.studentUI = null; State.selectedStudents.clear();
      renderApp(); toast(isFullBackup ? '导入成功（完整恢复）' : '已应用数据更新，进度已保留');
    } catch (err) { toast('导入失败：文件格式不正确'); }
  };
  r.readAsText(f);
  e.target.value = '';
});

/* ============================================================
 * 启动
 * ============================================================ */
let showBackupTip = false;
try {
  showBackupTip = !!localStorage.getItem(STORAGE_KEY) && !localStorage.getItem('teaching_workbench_v5_backup_tip');
} catch (e) { /* Storage may be unavailable in private browsing. */ }
DataManager.load();
renderApp();
if (showBackupTip) {
  toast('更新完成，建议从侧边栏导出一次备份', 5000);
  try { localStorage.setItem('teaching_workbench_v5_backup_tip', '1'); } catch (e) { /* Ignore unavailable storage. */ }
}

/* PWA：离线缓存（仅 https 环境下生效，本地 file:// 自动忽略） */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
