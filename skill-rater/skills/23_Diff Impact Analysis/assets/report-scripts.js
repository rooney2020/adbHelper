// diff-impact-analysis report interactive logic
// Injected inline by generate_report.py. SERVER and COMMIT are defined before this script.
function updateCount() {
  const n = document.querySelectorAll('.fix-cb:checked').length;
  document.getElementById('count').textContent = n;
  document.querySelectorAll('.risk-row').forEach(r => { const cb = r.querySelector('.fix-cb'); if (cb) r.classList.toggle('checked', cb.checked); });
}
function selectAll() { document.querySelectorAll('.fix-cb').forEach(c => { if(!c.closest('.risk-row').classList.contains('dismissed')) c.checked = true; }); updateCount(); }
function clearAll() { document.querySelectorAll('.fix-cb').forEach(c => c.checked = false); updateCount(); }
function showToast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
function toggleDismiss(btn) {
  const row = btn.closest('.risk-row');
  const cb = row.querySelector('.fix-cb');
  const isDismissed = !btn.classList.contains('active');
  btn.classList.toggle('active', isDismissed);
  row.classList.toggle('dismissed', isDismissed);
  if (isDismissed) { cb.checked = false; cb.disabled = true; }
  else { cb.disabled = false; }
  updateCount();
}
async function submitFixes() {
  const sel = [], dis = [];
  document.querySelectorAll('.fix-cb').forEach(cb => {
    const o = { id: cb.dataset.id, type: cb.dataset.type, description: cb.dataset.desc, file: cb.dataset.file || '', suggestion: cb.dataset.suggestion || '' };
    const row = cb.closest('.risk-row');
    const dismissBtn = row.querySelector('.btn-dismiss');
    if (dismissBtn && dismissBtn.classList.contains('active')) { dis.push(o); }
    else if (cb.checked) { sel.push(o); }
  });
  if (!sel.length && !dis.length) { alert('请至少选择修正或忽略一项'); return; }
  const payload = { action:'fix', selections:sel, dismissed:dis, commit:COMMIT, timestamp:new Date().toISOString() };
  try {
    const res = await fetch(SERVER + '/submit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (res.ok) { showToast('✓ 已提交 ' + sel.length + ' 项修正, ' + dis.length + ' 项忽略'); document.querySelector('.btn-filled').textContent = '⏳ AI 修正中...'; pollForNewReport(); }
    else throw new Error();
  } catch(e) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fix-selections.json'; a.click();
    showToast('⚠ 服务器不可用，已降级为文件下载');
  }
}
function pollForNewReport() {
  let n = 0; const iv = setInterval(async () => { n++; if(n>60){clearInterval(iv);return;} try{const r=await fetch(SERVER+'/report',{method:'HEAD'});if(r.ok){clearInterval(iv);location.reload();}}catch(e){}},1000);
}
document.addEventListener('change', e => { if (e.target.classList.contains('fix-cb')) updateCount(); });
document.querySelectorAll('.btn-dismiss').forEach(btn => { btn.addEventListener('click', e => { e.stopPropagation(); toggleDismiss(btn); }); });
document.querySelectorAll('.risk-row').forEach(row => { row.addEventListener('click', e => { if(e.target.type==='checkbox'||e.target.classList.contains('btn-dismiss'))return; const cb=row.querySelector('.fix-cb'); if(cb&&!cb.disabled){cb.checked=!cb.checked;updateCount();} }); });
document.addEventListener('keydown', e => { if(e.ctrlKey&&e.key==='a'){e.preventDefault();selectAll();} if(e.key==='Escape')clearAll(); if(e.ctrlKey&&e.key==='Enter')submitFixes(); });
