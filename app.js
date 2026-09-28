'use strict';
const DOMAINS = [
  {id:'work',name:'Работа и бизнес',short:'Работа',icon:'▥',color:'#366bc4',directions:['Работа и карьера','Стратегия и рынки','Новые проекты']},
  {id:'finance',name:'Капитал и финансы',short:'Финансы',icon:'↗',color:'#14836d',directions:['Личные финансы','Инвестпортфель','Инвестиционные идеи']},
  {id:'health',name:'Здоровье и энергия',short:'Здоровье',icon:'♡',color:'#c65b70',directions:['Здоровье','Форма и восстановление']},
  {id:'family',name:'Отношения и семья',short:'Семья',icon:'∞',color:'#ba7733',directions:['Близкие и отношения','Родительство']},
  {id:'learning',name:'Развитие и смысл',short:'Развитие',icon:'◇',color:'#8462be',directions:['Личное обучение','Обучение ребёнка','Исследования']},
  {id:'home',name:'Дом и организация жизни',short:'Дом',icon:'⌂',color:'#448896',directions:['Документы и процедуры','Жильё и транспорт']},
  {id:'lifestyle',name:'Отдых и впечатления',short:'Отдых',icon:'✧',color:'#b06499',directions:['Досуг и события','Путешествия']}
];
const KEY = 'life-os-v1';
const $ = id => document.getElementById(id);
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh = () => ({version:1,focus:'',goals:[],checkins:[]});
const number = v => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(v);
const date = v => new Date(v).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const validNumber = (n,min,max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
function validate(data) {
  if (!data || data.version !== 1 || typeof data.focus !== 'string' || data.focus.length>1000 || !Array.isArray(data.goals) || !Array.isArray(data.checkins) || data.goals.length>2000 || data.checkins.length>10000) throw new Error('Неподдерживаемый формат копии.');
  const ids=new Set();
  for(const g of data.goals) {
    const d=DOMAINS.find(d=>d.id===g.domain);
    if(!d || typeof g.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(g.id) || ids.has(g.id) || typeof g.title!=='string' || !g.title.trim() || g.title.length>160 || typeof g.unit!=='string' || g.unit.length>30 || !d.directions.includes(g.direction) || !validNumber(g.target,.01,1e9) || !validNumber(g.current,0,1e9) || typeof g.due!=='string' || (g.due && (!/^\d{4}-\d{2}-\d{2}$/.test(g.due) || !Number.isFinite(Date.parse(g.due))))) throw new Error('В копии есть некорректная цель.');
    ids.add(g.id);
  }
  for(const c of data.checkins) {
    if(typeof c.at!=='string' || !Number.isFinite(Date.parse(c.at)) || typeof c.note!=='string' || c.note.length>1000 || !c.ratings || typeof c.ratings!=='object' || Array.isArray(c.ratings)) throw new Error('В копии есть некорректная отметка.');
    const entries=Object.entries(c.ratings);
    if(!entries.length || entries.some(([key,value])=>!DOMAINS.some(d=>d.id===key) || !validNumber(value,0,10))) throw new Error('Оценки должны быть от 0 до 10.');
  }
  return {version:1,focus:data.focus,goals:data.goals.map(g=>({id:g.id,title:g.title,domain:g.domain,direction:g.direction,target:g.target,current:g.current,unit:g.unit,due:g.due})),checkins:data.checkins.map(c=>({at:c.at,note:c.note,ratings:{...c.ratings}})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))};
}
let state=fresh(),loadError=false,demoMode=false,realState=null,editingGoal=null,toastTimer;
try { const saved=localStorage.getItem(KEY); if(saved) state=validate(JSON.parse(saved)); } catch { loadError=true; }
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
function commit(next,message='Сохранено') {
  try {
    next=validate(next);
    if(!demoMode) {
      if(loadError) { notify('Сохранение остановлено: прежние данные не удалось прочитать. Сначала экспортируйте их.');return false; }
      localStorage.setItem(KEY,JSON.stringify(next));
    }
    state=next;render();notify(demoMode?'Изменён только демонстрационный пример':message);return true;
  } catch {notify('Не удалось сохранить. Проверьте доступность хранилища браузера и экспортируйте данные.');return false;}
}
const latest=()=>state.checkins.at(-1);
const mean=ratings=>{const values=Object.values(ratings||{});return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
const percent=g=>Math.min(100,Math.round(g.current/g.target*100));
function render(){
  const ratings=latest()?.ratings||{},average=mean(ratings);
  $('average').textContent=average===null?'—':number(average);
  $('coverage').textContent=average===null?'Пока нет оценок':`Оценено ${Object.keys(ratings).length} из 7 сфер · ${date(latest().at)}`;
  $('goal-count').textContent=state.goals.filter(g=>g.current<g.target).length;
  $('complete-count').textContent=state.goals.filter(g=>g.current>=g.target).length;
  $('weekly-focus').value=state.focus;
  const lowest=DOMAINS.filter(d=>ratings[d.id]!==undefined).sort((a,b)=>ratings[a.id]-ratings[b.id])[0];
  $('focus-text').textContent=state.focus || (lowest?`Можно уделить внимание сфере «${lowest.name.toLowerCase()}»: ${number(ratings[lowest.id])} из 10.`:'Начните с короткой оценки сфер жизни.');
  renderRadar(ratings);
  $('domain-grid').innerHTML=DOMAINS.map(d=>{const v=ratings[d.id],goals=state.goals.filter(g=>g.domain===d.id);return `<article class="domain-card" style="--accent:${d.color}"><div class="domain-top"><span class="domain-icon" aria-hidden="true">${d.icon}</span><span class="domain-score">${v===undefined?'—':number(v)} <small>/ 10</small></span></div><h3>${d.name}</h3><div class="directions">${d.directions.map(t=>`<span>${t}</span>`).join('')}</div><div class="domain-foot"><span class="muted">${v===undefined?'Пока без оценки':'Удовлетворённость сферой'}</span><div class="bar"><span style="width:${(v||0)*10}%"></span></div><button data-rate="${d.id}">${v===undefined?'Оценить сферу':'Обновить оценку'} ↗</button><div class="domain-goals">Целей: ${goals.length} · Достигнуто: ${goals.filter(g=>g.current>=g.target).length}</div></div></article>`;}).join('')+'<article class="domain-card guide-card"><h3>Маленький шаг.<br>Заметное движение.</h3><p>Выберите один результат, который приблизит вас к желаемому состоянию.</p><button data-add-goal>+ Создать цель</button></article>';
  renderGoals();renderTrend();
}
function renderRadar(ratings){
  const cx=170,cy=139,r=88;
  const point=(i,value)=>{const a=-Math.PI/2+i*2*Math.PI/7;return [cx+Math.cos(a)*r*value/10,cy+Math.sin(a)*r*value/10];};
  const polygon=value=>DOMAINS.map((_,i)=>point(i,value).join(',')).join(' ');
  let svg=`<svg viewBox="0 0 340 280" role="img" aria-label="Баланс сфер жизни: ${DOMAINS.map(d=>`${d.short} ${ratings[d.id]??'без оценки'}`).join(', ')}"><title>Самооценка сфер от 0 до 10</title>`;
  for(let step=2;step<=10;step+=2)svg+=`<polygon points="${polygon(step)}" fill="${step===2?'#f4f8fa':'none'}" stroke="#dfe8ee"/>`;
  DOMAINS.forEach((d,i)=>{const p=point(i,10),label=point(i,12.3);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#e1e9ee"/><text x="${label[0]}" y="${label[1]+4}" text-anchor="middle" fill="#5b7181" font-size="12">${d.short}</text>`;});
  if(DOMAINS.every(d=>ratings[d.id]!==undefined)) svg+=`<polygon points="${DOMAINS.map((d,i)=>point(i,ratings[d.id]).join(',')).join(' ')}" fill="#17ab8c22" stroke="#148b76" stroke-width="2.5"/>`;
  DOMAINS.forEach((d,i)=>{if(ratings[d.id]!==undefined){const p=point(i,ratings[d.id]);svg+=`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${d.color}" stroke="white" stroke-width="1.5"><title>${d.name}: ${ratings[d.id]}</title></circle>`;}});
  if(!Object.keys(ratings).length)svg+=`<rect x="104" y="122" width="132" height="34" rx="17" fill="white" stroke="#dae5ea"/><text x="170" y="144" text-anchor="middle" fill="#637687" font-size="13">Добавьте оценки</text>`;
  $('radar').innerHTML=svg+'</svg>';
}
function renderGoals(){
  const filter=$('goal-filter').value,goals=state.goals.filter(g=>filter==='all'||g.domain===filter);
  $('goal-list').innerHTML=goals.length?goals.map(g=>{const d=DOMAINS.find(d=>d.id===g.domain),p=percent(g);return `<article class="goal-row"><div><h3>${escapeHTML(g.title)}</h3><p class="muted">${d.name} · ${escapeHTML(g.direction)}${g.due?` · до ${date(g.due+'T12:00:00')}`:''}</p></div><div><div class="goal-number"><span>${number(g.current)} / ${number(g.target)} ${escapeHTML(g.unit)}</span><strong class="${p===100?'done-tag':''}">${p}%</strong></div><div class="bar" style="--accent:${d.color}" role="progressbar" aria-label="${escapeHTML(g.title)}" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div></div><div class="goal-actions"><button class="secondary" data-progress="${g.id}">Обновить</button><button class="danger" data-delete="${g.id}" aria-label="Удалить цель ${escapeHTML(g.title)}">×</button></div></article>`;}).join(''):`<div class="empty"><h3>${filter==='all'?'Здесь появятся ваши цели':'В этой сфере пока нет целей'}</h3><p>Укажите результат и измеримую цель. Процент выполнения будет рассчитываться автоматически.</p><button class="secondary" data-add-goal>Добавить первую цель</button></div>`;
}
function renderTrend(){
  const filter=$('history-filter').value;
  const entries=state.checkins.map(c=>({...c,value:filter==='all'?mean(c.ratings):c.ratings[filter]})).filter(c=>c.value!==null&&c.value!==undefined).slice(-12);
  if(!entries.length){$('trend').innerHTML='<div class="empty"><h3>История ещё впереди</h3><p>Сохраните первую оценку, чтобы увидеть отправную точку.</p></div>';return;}
  const x=i=>60+(entries.length===1?400:i*800/(entries.length-1)),y=v=>155-v*13;
  let svg='<svg viewBox="0 0 920 195" role="img" aria-label="Динамика оценок от 0 до 10">';
  [0,5,10].forEach(v=>svg+=`<line x1="50" x2="875" y1="${y(v)}" y2="${y(v)}" stroke="#e3ebef"/><text x="25" y="${y(v)+4}" font-size="12" fill="#718393">${v}</text>`);
  if(entries.length>1)svg+=`<polyline points="${entries.map((e,i)=>`${x(i)},${y(e.value)}`).join(' ')}" fill="none" stroke="#158c76" stroke-width="3"/>`;
  entries.forEach((e,i)=>{svg+=`<circle cx="${x(i)}" cy="${y(e.value)}" r="5" fill="#148b76"><title>${date(e.at)}: ${number(e.value)}</title></circle><text x="${x(i)}" y="${y(e.value)-12}" text-anchor="middle" font-size="13" fill="#146b5c">${number(e.value)}</text><text x="${x(i)}" y="183" text-anchor="middle" font-size="12" fill="#718393">${date(e.at)}</text>`;});
  $('trend').innerHTML=svg+'</svg><div class="history-list">'+entries.slice(-3).reverse().map(e=>`<div class="history-entry"><strong>${date(e.at)} · ${number(e.value)}/10</strong> · ${Object.keys(e.ratings).length}/7 сфер${e.note?`<div class="note">${escapeHTML(e.note)}</div>`:''}</div>`).join('')+'</div>';
}
function openCheckin(focus){
  const ratings=latest()?.ratings||{};
  $('rating-fields').innerHTML=DOMAINS.map(d=>`<div class="rating-row"><label for="rate-${d.id}">${d.name}</label><input id="rate-${d.id}" name="${d.id}" type="number" min="0" max="10" step="0.5" placeholder="—" value="${ratings[d.id]??''}"></div>`).join('');
  $('checkin-note').value='';$('checkin-dialog').showModal();if(focus)$('rate-'+focus).focus();
}
function openGoal(){ $('goal-form').reset();if($('goal-filter').value!=='all')$('goal-domain').value=$('goal-filter').value;updateDirections();$('goal-dialog').showModal(); }
function updateDirections(){const d=DOMAINS.find(d=>d.id===$('goal-domain').value);$('goal-direction').innerHTML=d.directions.map(t=>`<option>${t}</option>`).join('');}
const options=DOMAINS.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
$('goal-domain').innerHTML=options;$('goal-filter').insertAdjacentHTML('beforeend',options);$('history-filter').insertAdjacentHTML('beforeend',options);
$('today').textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
$('check-in').onclick=()=>openCheckin();$('add-goal').onclick=openGoal;
$('goal-domain').onchange=updateDirections;$('goal-filter').onchange=renderGoals;$('history-filter').onchange=renderTrend;
$('save-focus').onclick=()=>commit({...state,focus:$('weekly-focus').value.trim()},'Фокус недели сохранён');
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-close'))b.closest('dialog').close();
  if(b.hasAttribute('data-rate'))openCheckin(b.dataset.rate);
  if(b.hasAttribute('data-add-goal'))openGoal();
  if(b.dataset.progress){editingGoal=b.dataset.progress;const g=state.goals.find(g=>g.id===editingGoal);$('progress-title').textContent=g.title;$('progress-value').value=g.current;$('progress-target').textContent=`Цель: ${number(g.target)} ${g.unit}`;$('progress-dialog').showModal();}
  if(b.dataset.delete&&confirm('Удалить эту цель?'))commit({...state,goals:state.goals.filter(g=>g.id!==b.dataset.delete)},'Цель удалена');
});
$('checkin-form').onsubmit=event=>{event.preventDefault();const ratings={};for(const d of DOMAINS){const v=$('rate-'+d.id).value;if(v!=='')ratings[d.id]=Number(v);}if(!Object.keys(ratings).length){notify('Добавьте хотя бы одну оценку.');return;}if(commit({...state,checkins:[...state.checkins,{at:new Date().toISOString(),ratings,note:$('checkin-note').value.trim()}]},'Новая отметка сохранена'))$('checkin-dialog').close();};
$('goal-form').onsubmit=event=>{event.preventDefault();const title=$('goal-title').value.trim();if(!title){notify('Введите название цели.');return;}const g={id:crypto.randomUUID(),title,domain:$('goal-domain').value,direction:$('goal-direction').value,target:Number($('goal-target').value),current:0,unit:$('goal-unit').value.trim(),due:$('goal-date').value};if(commit({...state,goals:[...state.goals,g]},'Цель добавлена'))$('goal-dialog').close();};
$('progress-form').onsubmit=event=>{event.preventDefault();if(commit({...state,goals:state.goals.map(g=>g.id===editingGoal?{...g,current:Number($('progress-value').value)}:g)},'Результат обновлён'))$('progress-dialog').close();};
function download(data,name){const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>{if(loadError&&!demoMode){try{const raw=localStorage.getItem(KEY);if(raw){download(raw,'life-os-recovery.json');notify('Исходные данные экспортированы без изменений.');return;}}catch{notify('Браузер не даёт прочитать хранилище.');return;}}download(JSON.stringify(state,null,2),`life-os-${new Date().toISOString().slice(0,10)}${demoMode?'-example':''}.json`);};
$('import').onclick=()=>{if(demoMode){notify('Сначала выйдите из примера.');return;}$('import-file').click();};
$('import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>5e6)throw new Error('Файл слишком большой (максимум 5 МБ).');const imported=validate(JSON.parse(await file.text()));if(!confirm('Заменить текущие данные содержимым копии? Сначала экспортируйте текущие данные, если хотите их сохранить.'))return;localStorage.setItem(KEY,JSON.stringify(imported));loadError=false;state=imported;render();notify('Данные восстановлены');}catch(error){notify('Импорт не выполнен: '+error.message);}finally{event.target.value='';}};
$('demo').onclick=()=>{
  if(demoMode)return;
  realState=state;demoMode=true;state=fresh();state.focus='Освободить два вечера для близких и завершить важный рабочий этап.';
  state.checkins=Array.from({length:5},(_,i)=>({at:new Date(Date.now()-(4-i)*7*864e5).toISOString(),note:i===4?'Пример: удалось выделить время на восстановление.':'',ratings:Object.fromEntries(DOMAINS.map((d,j)=>[d.id,Math.min(9,3+(j%4)+i*.5)]))}));
  state.goals=[{id:'demo-1',title:'Завершить учебный курс',domain:'learning',direction:'Личное обучение',current:7,target:10,unit:'занятий',due:''},{id:'demo-2',title:'Вернуться к регулярным тренировкам',domain:'health',direction:'Форма и восстановление',current:4,target:12,unit:'тренировок',due:''},{id:'demo-3',title:'Спланировать совместный выходной',domain:'family',direction:'Близкие и отношения',current:1,target:1,unit:'план',due:''}];
  const banner=document.createElement('div');banner.id='demo-banner';banner.className='demo-banner';banner.innerHTML='<span>Демонстрационный пример · это не ваши показатели</span><button id="exit-demo">Вернуться к моим данным</button>';document.querySelector('main').prepend(banner);$('exit-demo').onclick=()=>{state=realState;realState=null;demoMode=false;banner.remove();render();notify('Ваши данные восстановлены');};render();window.scrollTo({top:0,behavior:'smooth'});
};
$('export-footer').onclick=()=>$('export').click();$('import-footer').onclick=()=>$('import').click();
render();if(loadError)notify('Не удалось загрузить сохранённые данные. Они не перезаписаны. Экспортируйте исходную копию.');
