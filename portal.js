  const firebaseConfig = {
    apiKey: "AIzaSyC8zai8A4ynGxJz22YKmkwNP7Ir2MXwbAQ",
    authDomain: "scg-portal-d129d.firebaseapp.com",
    projectId: "scg-portal-d129d",
    storageBucket: "scg-portal-d129d.firebasestorage.app",
    messagingSenderId: "239332916516",
    appId: "1:239332916516:web:646163b28009b1f6c107b1"
  };
  // --- Защищённая инициализация Firebase ---------------------------------
  // Раньше здесь был прямой вызов firebase.initializeApp(). Если SDK не
  // загрузился (обрыв связи, фильтр в корпоративной сети), скрипт падал на
  // этой строке целиком — и функция doLogin() вообще не создавалась.
  // Кнопка «Войти» становилась мёртвой без единого сообщения.
  let auth = null, db = null, firebaseReady = false;
  try {
    if (typeof firebase === 'undefined') throw new Error('Firebase SDK не загрузился');
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db   = firebase.firestore();
    firebaseReady = true;
  } catch (e) {
    console.error('Firebase недоступен:', e);
  }

  // ---------- EmailJS: авто-отправка чек-листа РОПу после подтверждения оценки ----------
  try{
    if(typeof emailjs !== 'undefined'){
      emailjs.init({ publicKey: 'ym_rT5D6FUWH1VyKF' });
    } else {
      console.warn('EmailJS не загрузился — отправка чек-листа будет недоступна, но портал работает.');
    }
  } catch(e){
    console.warn('Ошибка инициализации EmailJS:', e);
  }
  const EMAILJS_SERVICE_ID = 'service_p3nngca';
  const EMAILJS_TEMPLATE_ID = 'template_ka6z6mq';

  const ROP_EMAILS = {
    spb_onishchuk: 'a.onishchuk@1gl-spb.ru',
    msk_murtazaev: 'e.murtazaev@1gl-spb.ru',
    novgorod_bikmansurov: 'r.bikmansurov@1gl-spb.ru',
    pskov_smirnov: 'al.smirnov@1gl-spb.ru',
    cherepovets_zelenuho: 'a.zelenuho@1gl-spb.ru',
    lipetsk_dediaeva: 'a.dediaeva@1gl-spb.ru',
    voronezh_rotenberg: 's.rotenberg@1gl-spb.ru',
    spb_dop: 'k.musakina@1gl-spb.ru'
  };

  const GROUP_LABELS = { 'новый':'Новый', 'слабый':'Слабый', 'средний':'Средний', 'сильный':'Сильный' };

  function go(name){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-'+name).classList.add('active');
    window.scrollTo(0,0);
    if(name === 'rating'){ renderRating(); }
    if(name === 'best'){ bestCallsLoaded ? renderBestCalls() : loadBestCalls(); }
    if(name === 'dashboard'){ returnScreen = 'dashboard'; }
  }

  let currentMonthOffset = 0;

  function getMonthRange(offset){
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
    const end = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
    const label = d.toLocaleDateString('ru-RU', {month:'long', year:'numeric'});
    return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }

  function changeRatingMonth(delta){
    currentMonthOffset += delta;
    renderRating();
  }

  function renderRating(){
    const listEl = document.getElementById('ratingList');
    const labelEl = document.getElementById('ratingMonthLabel');
    if(!listEl || !labelEl) return;

    const range = getMonthRange(currentMonthOffset);
    labelEl.textContent = range.label;

    if(!currentMops || currentMops.length === 0){
      listEl.innerHTML = '<div class="empty-state"><div class="ic"><svg viewBox="0 0 100 100" width="38" height="38"><use href="#scg-mark" xlink:href="#scg-mark"/></svg></div><div class="tt">Нет данных о команде</div><div class="ds">Добавьте сотрудников в коллекцию mops в Firestore, чтобы увидеть рейтинг.</div></div>';
      return;
    }

    const monthCalls = (currentCalls || []).filter(c => {
      const d = new Date(c.date);
      return d >= range.start && d <= range.end;
    });

    const rows = currentMops.map(m => {
      const mopCalls = monthCalls.filter(c => c.mopId === m.id && c.aiAnalysis && typeof c.aiAnalysis.score === 'number');
      const avg = mopCalls.length ? (mopCalls.reduce((s,c)=>s+c.aiAnalysis.score,0) / mopCalls.length) : null;
      return { mop: m, avg };
    });

    const scored = rows.filter(r => r.avg !== null).sort((a,b) => b.avg - a.avg);

    if(scored.length === 0){
      listEl.innerHTML = '<div class="empty-state"><div class="ic"><svg viewBox="0 0 100 100" width="38" height="38"><use href="#scg-mark" xlink:href="#scg-mark"/></svg></div><div class="tt">Пока нет оценённых звонков</div><div class="ds">За этот месяц рейтинг ещё не сформирован — он появится, как только начнут поступать разборы звонков.</div></div>';
      return;
    }

    listEl.innerHTML = scored.map((r, idx) => {
      const rank = idx + 1;
      const pct = Math.max(0, Math.min(100, Math.round(r.avg * 10)));
      const barColor = r.avg < 6 ? 'background:var(--bad);' : '';
      const topClass = rank === 1 ? ' top1' : '';
      let badge = '';
      if(rank === 1) badge = '<span class="badge">Топ месяца</span>';
      else if(r.avg < 6) badge = '<span class="badge" style="background:var(--bad-bg);color:var(--bad);">Нужна поддержка</span>';
      return `
        <div class="rrow${topClass}">
          <div class="rank">${rank}</div>
          <div class="who"><div class="n">${r.mop.name || 'Без имени'}</div></div>
          <div class="badges-row">${badge}</div>
          <div class="bar-wrap"><div class="bar" style="width:${pct}%; ${barColor}"></div></div>
          <div class="score">${r.avg.toFixed(1)}</div>
        </div>`;
    }).join('');
  }

  async function loadBestCalls(){
    try{
      const snap = await db.collection('calls')
        .where('aiAnalysis.score', '>=', BEST_SCORE_THRESHOLD)
        .orderBy('aiAnalysis.score', 'desc')
        .limit(30)
        .get();
      bestCalls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e){
      console.error('Не удалось загрузить лучшие звонки:', e);
      bestCalls = [];
    }
    bestCallsLoaded = true;
    renderBestCalls();
  }

  function renderBestCalls(){
    const listEl = document.getElementById('bestCallsList');
    const countEl = document.getElementById('bestCount');
    if(!listEl) return;
    if(countEl) countEl.textContent = bestCalls.length;

    if(bestCalls.length === 0){
      listEl.innerHTML = `<div class="empty-state"><div class="ic"><svg viewBox="0 0 100 100" width="38" height="38"><use href="#scg-mark" xlink:href="#scg-mark"/></svg></div><div class="tt">Пока нет звонков с оценкой от ${BEST_SCORE_THRESHOLD.toFixed(1)}</div><div class="ds">Как только у любого филиала появится звонок с оценкой 80% и выше, он окажется здесь и станет виден всей компании.</div></div>`;
      return;
    }

    listEl.innerHTML = bestCalls.map(c => {
      const mop = companyMopMap[c.mopId] || mopMap[c.mopId];
      const mopName = mop ? mop.name : 'МОП';
      const rop = mop ? companyRopMap[mop.ropId] : null;
      const branchName = rop ? (rop.branch || rop.name) : '—';
      const score = c.aiAnalysis && typeof c.aiAnalysis.score === 'number' ? c.aiAnalysis.score : '—';
      const dateStr = formatCallDate(c.date);
      const badgeText = (typeof score === 'number' && score >= 9) ? 'Топ' : '80%+';
      return `
        <div class="row" onclick="returnScreen='best'; openCallDetail('${c.id}')">
          <div class="who"><div class="n">${branchName} · ${mopName}</div><div class="m">Звонок ${dateStr}</div></div>
          <span class="pill good">${badgeText}</span>
          <div class="score">${score}</div>
          <div class="arrow-btn">›</div>
        </div>`;
    }).join('');
  }

  function toggleTeamGroup(groupId, headerEl){
    const groupEl = document.getElementById(groupId);
    const arrowEl = document.getElementById('arrow_' + groupId);
    if(!groupEl) return;
    const isOpen = groupEl.style.display !== 'none';
    groupEl.style.display = isOpen ? 'none' : 'block';
    if(arrowEl) arrowEl.classList.toggle('open', !isOpen);
  }

  function getInitials(name){
    if(!name) return '—';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0]||'') + (parts[1]?.[0]||'')).toUpperCase() || '—';
  }

  function openManagerDetail(mopId){
    const mop = mopMap[mopId];
    if(!mop) return;
    currentManagerMopId = mopId;

    document.getElementById('mgrAvatar').textContent = getInitials(mop.name);
    document.getElementById('mgrName').textContent = mop.name || 'Без имени';
    document.getElementById('mgrGroup').textContent = GROUP_LABELS[(mop.group||'').toLowerCase()] || mop.group || '—';

    const mopCalls = (currentCalls || []).filter(c => c.mopId === mopId).sort((a,b) => new Date(b.date) - new Date(a.date));

    const now = new Date();
    const monthCalls = mopCalls.filter(c => {
      const d = new Date(c.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    document.getElementById('mgrCallsTotal').textContent = `${monthCalls.length} звонк${monthCalls.length===1?'':(monthCalls.length<5?'а':'ов')} разобрано с начала месяца`;

    const monthScores = monthCalls.map(c => c.aiAnalysis && typeof c.aiAnalysis.score === 'number' ? c.aiAnalysis.score : null).filter(v => v !== null);
    document.getElementById('mgrMonthAvg').textContent = monthScores.length ? (monthScores.reduce((a,b)=>a+b,0)/monthScores.length).toFixed(1) : '—';

    renderMgrChart(mopCalls);

    const recs = mopCalls.map(c => c.aiAnalysis && c.aiAnalysis.recommendation).filter(Boolean).slice(0, 3);
    const recListEl = document.getElementById('mgrRecList');
    recListEl.innerHTML = recs.length
      ? recs.map((r, i) => `<div class="rec"><span class="num">${i+1}.</span> ${r}</div>`).join('')
      : '<div class="rec">Пока нет рекомендаций — недостаточно разобранных звонков.</div>';

    document.getElementById('mgrCallsCount').textContent = mopCalls.length;
    const callsListEl = document.getElementById('mgrCallsList');
    callsListEl.innerHTML = mopCalls.length
      ? mopCalls.map(c => {
          const score = c.aiAnalysis ? c.aiAnalysis.score : '—';
          const isPending = c.analystReview && c.analystReview.status === 'pending';
          const pillClass = isPending ? 'wait' : (score !== '—' && score < 6 ? 'bad' : 'good');
          const pillText = isPending ? 'На проверке' : (score !== '—' && score < 6 ? 'Низкий балл' : 'Хорошо');
          const durMin = c.durationSeconds ? Math.round(c.durationSeconds/60) + ' мин' : '—';
          return `
          <div class="row" onclick="returnScreen='manager'; openCallDetail('${c.id}')">
            <div class="who"><div class="n">${formatCallDate(c.date)}</div><div class="m">${durMin}</div></div>
            <span class="pill ${pillClass}">${pillText}</span>
            <div class="score">${score}</div>
            <div class="arrow-btn">›</div>
          </div>`;
        }).join('')
      : '<div class="empty-state"><div class="ic"><svg viewBox="0 0 100 100" width="38" height="38"><use href="#scg-mark" xlink:href="#scg-mark"/></svg></div><div class="tt">Звонков пока нет</div><div class="ds">Как только появятся разобранные звонки этого сотрудника, они отобразятся здесь.</div></div>';

    go('manager');
  }

  function renderMgrChart(mopCalls){
    const wrap = document.getElementById('mgrChartWrap');
    if(!wrap) return;

    const weeks = [];
    for(let i = 4; i >= 0; i--){
      const range = getWeekRange(-i);
      const wc = mopCalls.filter(c => {
        const d = new Date(c.date);
        return d >= range.start && d <= range.end;
      });
      const scores = wc.map(c => c.aiAnalysis && typeof c.aiAnalysis.score === 'number' ? c.aiAnalysis.score : null).filter(v => v !== null);
      const avg = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
      const weekNum = Math.ceil((((range.start - new Date(range.start.getFullYear(),0,1)) / 86400000) + new Date(range.start.getFullYear(),0,1).getDay()+1) / 7);
      weeks.push({ avg, label: `Нед. ${weekNum}` });
    }

    const withData = weeks.filter(w => w.avg !== null);
    if(withData.length < 2){
      wrap.innerHTML = '<p style="color:var(--gray); font-size:13.5px; padding:20px 0;">Недостаточно данных для графика — нужно минимум 2 недели с оценёнными звонками.</p>';
      return;
    }

    const W = 560, H = 140, padX = 20;
    const step = (W - padX*2) / (weeks.length - 1);
    const yFor = v => 20 + (1 - v/10) * 90;

    let points = [];
    let circles = [];
    weeks.forEach((w, i) => {
      if(w.avg === null) return;
      const x = padX + step*i;
      const y = yFor(w.avg);
      points.push(`${x},${y}`);
      circles.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="#E8641F"/>`);
    });

    const labels = weeks.map((w, i) => `<text x="${padX + step*i - 12}" y="135" font-size="11" fill="#8A8A8A">${w.label}</text>`).join('');

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="140" style="overflow:visible;">
        <line x1="0" y1="20" x2="${W}" y2="20" stroke="#EEE7DE" stroke-width="1"/>
        <line x1="0" y1="70" x2="${W}" y2="70" stroke="#EEE7DE" stroke-width="1"/>
        <line x1="0" y1="120" x2="${W}" y2="120" stroke="#EEE7DE" stroke-width="1"/>
        <polyline points="${points.join(' ')}" fill="none" stroke="#E8641F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${circles.join('')}
        ${labels}
      </svg>`;
  }

  let currentManagerMopId = null;

  function setLoginError(msg){
    const box = document.getElementById('loginError');
    box.textContent = msg;
    box.style.display = msg ? 'block' : 'none';
  }

  function doLogin(){
    if(!firebaseReady){
      setLoginError('Не удалось подключиться к серверу авторизации. Обновите страницу сочетанием Ctrl+Shift+R. Если не помогает — сеть вашего офиса блокирует загрузку, сообщите аналитику SCG.');
      return;
    }
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    setLoginError('');

    if(!email || !password){
      setLoginError('Введите email и пароль.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Входим...';

    auth.signInWithEmailAndPassword(email, password)
      .then(cred => loadRopData(cred.user.uid))
      .catch(err => {
        btn.disabled = false;
        btn.textContent = 'Войти';
        setLoginError('Неверный email или пароль.');
        console.error(err);
      });
  }

  async function loadRopData(uid){
    const btn = document.getElementById('loginBtn');
    try{
      const userDoc = await db.collection('users').doc(uid).get();
      if(!userDoc.exists){
        setLoginError('Этот аккаунт не привязан к команде. Обратитесь к аналитику SCG.');
        btn.disabled = false;
        btn.textContent = 'Войти';
        auth.signOut();
        return;
      }
      const userData = userDoc.data();
      const isAdmin = userData.role === 'admin';

      let ropData, mops, calls, rops;

      if(isAdmin){
        const ropsSnap = await db.collection('rops').get();
        rops = ropsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        ropMap = {};
        rops.forEach(r => { ropMap[r.id] = r; });

        const mopsSnap = await db.collection('mops').get();
        mops = mopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const callsSnap = await db.collection('calls').get();
        calls = callsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        calls.sort((a, b) => new Date(b.date) - new Date(a.date));

        ropData = { name: userData.name, branch: `Вся компания · ${rops.length} филиал(ов)` };
        currentRopId = null;
      } else {
        const ropDoc = await db.collection('rops').doc(userData.ropId).get();
        ropData = ropDoc.exists ? ropDoc.data() : { name: userData.name, branch: '—' };

        const mopsSnap = await db.collection('mops').where('ropId', '==', userData.ropId).get();
        mops = mopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const callsSnap = await db.collection('calls').where('ropId', '==', userData.ropId).get();
        calls = callsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        calls.sort((a, b) => new Date(b.date) - new Date(a.date));

        currentRopId = userData.ropId;
      }

      isAdminUser = isAdmin;
      currentMops = mops;
      currentCalls = calls;
      mopMap = {};
      mops.forEach(m => { mopMap[m.id] = m; });

      // Company-wide directory (all branches, all MOP) — used to show names/branches
      // on the company-wide "Лучшие звонки" list, available to every signed-in user.
      // Requires Firestore rules to allow read on /rops and /mops for any signed-in user.
      try{
        const allRopsSnap = await db.collection('rops').get();
        companyRopMap = {};
        allRopsSnap.docs.forEach(d => { companyRopMap[d.id] = { id: d.id, ...d.data() }; });

        const allMopsSnap = await db.collection('mops').get();
        companyMopMap = {};
        allMopsSnap.docs.forEach(d => { companyMopMap[d.id] = { id: d.id, ...d.data() }; });
      } catch(e){
        console.error('Не удалось загрузить общий справочник филиалов/МОП:', e);
      }
      loadBestCalls();
      loadCustomGames();
      applyGamesAccess();

      renderRealDashboard(userData, ropData, mops, calls);
      populateMopSelect(mops);
      renderPromptBox();
      populateSettings(userData, ropData);
      applyAddCallAccess();
      btn.disabled = false;
      btn.textContent = 'Войти';
      go('dashboard');
    } catch(err){
      console.error(err);
      setLoginError('Не удалось загрузить данные. Попробуйте ещё раз.');
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }

  function getWeekRange(offset){
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + offset * 7);
    monday.setHours(0,0,0,0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return { start: monday, end: sunday };
  }

  function formatWeekLabel(range){
    const sameMonth = range.start.getMonth() === range.end.getMonth();
    const startStr = range.start.toLocaleDateString('ru-RU', sameMonth ? {day:'2-digit'} : {day:'2-digit', month:'long'});
    const endStr = range.end.toLocaleDateString('ru-RU', {day:'2-digit', month:'long'});
    return `${startStr}–${endStr}`;
  }

  function changeWeek(delta){
    currentWeekOffset += delta;
    if(currentUserData){
      renderRealDashboard(currentUserData, currentRopData, currentMops, currentCalls);
    }
  }

  function renderRealDashboard(userData, ropData, mops, calls){
    currentUserData = userData;
    currentRopData = ropData;

    document.querySelectorAll('.sbName').forEach(el => el.textContent = userData.name || ropData.name || '—');
    document.querySelectorAll('.sbBranch').forEach(el => el.textContent = (ropData.branch || '—') + (isAdminUser ? ' · Админ' : ' · РОП'));

    const quickRows = isAdminUser
      ? [
          { val: (ropMap ? Object.keys(ropMap).length : 0), lbl: 'филиалов в работе' },
          { val: mops.length, lbl: 'МОП в базе' },
        ]
      : [
          { val: mops.length, lbl: 'человек в команде' },
        ];
    const quickHtml = quickRows.map(r => `<div class="qrow"><span class="qval">${r.val}</span><span class="qlbl">${r.lbl}</span></div>`).join('');
    document.querySelectorAll('.sbQuickStats').forEach(el => {
      el.innerHTML = quickHtml;
      el.classList.add('filled');
    });

    const firstName = (userData.name || '').split(' ')[0] || '';
    document.getElementById('topGreeting').textContent = firstName ? `Здравствуйте, ${firstName}` : 'Здравствуйте';

    document.getElementById('realDataNote').style.display = calls.length > 0 ? 'none' : 'block';
    document.getElementById('teamCount').textContent = mops.length + ' МОП';

    const weekRange = getWeekRange(currentWeekOffset);
    document.getElementById('weekLabel').textContent = formatWeekLabel(weekRange);
    calls = calls.filter(c => {
      const d = new Date(c.date);
      return d >= weekRange.start && d <= weekRange.end;
    });

    const totalCalls = calls.length;
    const scores = calls.map(c => c.aiAnalysis && typeof c.aiAnalysis.score === 'number' ? c.aiAnalysis.score : null).filter(v => v !== null);
    const avgScore = scores.length ? (scores.reduce((a,b)=>a+b,0) / scores.length).toFixed(1) : '—';
    const pendingCount = calls.filter(c => c.analystReview && c.analystReview.status === 'pending').length;

    document.getElementById('statCallsVal').innerHTML = totalCalls ? `${totalCalls}` : '0 <small>звонков за эту неделю</small>';
    document.getElementById('statAvgVal').innerHTML = scores.length ? `${avgScore} <small>/ 10</small>` : '— <small>нет оценённых</small>';
    document.getElementById('statPendingVal').textContent = pendingCount;

    const attention = calls.filter(c => (c.analystReview && c.analystReview.status === 'pending') || (c.aiAnalysis && c.aiAnalysis.score < 6)).slice(0, 8);
    document.getElementById('attentionCount').textContent = attention.length;
    const attList = document.getElementById('attentionList');
    if(attention.length === 0){
      attList.innerHTML = '<div class="empty-state"><div class="ic"><svg viewBox="0 0 100 100" width="38" height="38"><use href="#scg-mark" xlink:href="#scg-mark"/></svg></div><div class="tt">Пока нет звонков, требующих внимания</div><div class="ds">Как только появятся спорные оценки или звонки на проверке — они появятся здесь. Добавьте звонок через раздел «+ Добавить звонок».</div></div>';
    } else {
      attList.innerHTML = attention.map(c => {
        const mop = mopMap[c.mopId];
        const mopName = mop ? mop.name : 'МОП';
        const branchTag = isAdminUser && mop && ropMap[mop.ropId] ? `${ropMap[mop.ropId].branch || ropMap[mop.ropId].name} · ` : '';
        const score = c.aiAnalysis ? c.aiAnalysis.score : '—';
        const isPending = c.analystReview && c.analystReview.status === 'pending';
        const dateStr = formatCallDate(c.date);
        const weak = c.aiAnalysis && c.aiAnalysis.weaknesses && c.aiAnalysis.weaknesses[0] ? c.aiAnalysis.weaknesses[0] : 'требует проверки';
        return `
          <div class="row" onclick="openCallDetail('${c.id}')">
            <div class="who"><div class="n">${branchTag}${mopName}</div><div class="m">Звонок ${dateStr} · ${weak}</div></div>
            <span class="pill ${isPending ? 'wait' : 'bad'}">${isPending ? 'На проверке' : 'Низкий балл'}</span>
            <div class="score">${score}</div>
            <div class="arrow-btn">›</div>
          </div>`;
      }).join('');
    }

    const list = document.getElementById('teamList');
    if(mops.length === 0){
      list.innerHTML = '<div class="empty-state"><div class="ic"><svg viewBox="0 0 100 100" width="38" height="38"><use href="#scg-mark" xlink:href="#scg-mark"/></svg></div><div class="tt">В команде пока нет МОП</div><div class="ds">Добавьте сотрудников в коллекцию mops в Firestore, чтобы увидеть команду здесь.</div></div>';
      return;
    }

    function mopRow(m){
      const mopCalls = calls.filter(c => c.mopId === m.id);
      const countLabel = mopCalls.length ? `${mopCalls.length} звонк${mopCalls.length===1?'':(mopCalls.length<5?'а':'ов')} в базе` : 'Звонков пока нет';
      const lastScore = mopCalls.length && mopCalls[0].aiAnalysis ? mopCalls[0].aiAnalysis.score : null;
      return `
      <div class="row" onclick="openManagerDetail('${m.id}')">
        <span class="grp-tag">${GROUP_LABELS[(m.group||'').toLowerCase()] || m.group || '—'}</span>
        <div class="who"><div class="n">${m.name || 'Без имени'}</div><div class="m">${countLabel}</div></div>
        <div class="trend flat">—</div>
        <div class="score">${lastScore !== null ? lastScore : '—'}</div>
        <div class="arrow-btn">›</div>
      </div>`;
    }

    if(isAdminUser){
      const byRop = {};
      mops.forEach(m => {
        const key = m.ropId || '—';
        if(!byRop[key]) byRop[key] = [];
        byRop[key].push(m);
      });
      const ropIds = Object.keys(byRop).sort((a, b) => {
        const nameA = (ropMap[a] && (ropMap[a].branch || ropMap[a].name)) || '';
        const nameB = (ropMap[b] && (ropMap[b].branch || ropMap[b].name)) || '';
        return nameA.localeCompare(nameB, 'ru');
      });
      list.innerHTML = ropIds.map(ropId => {
        const rop = ropMap[ropId];
        const branchName = rop ? (rop.branch || rop.name) : 'Без филиала';
        const ropName = rop ? rop.name : '';
        const group = byRop[ropId];
        const groupId = 'teamGroup_' + ropId.replace(/[^a-zA-Z0-9_]/g, '_');
        return `
        <div class="row" style="background:var(--paper);" onclick="toggleTeamGroup('${groupId}', this)">
          <div class="team-toggle-arrow" id="arrow_${groupId}">›</div>
          <div class="who"><div class="n">${branchName}</div><div class="m">${ropName ? 'РОП: ' + ropName + ' · ' : ''}${group.length} МОП</div></div>
        </div>
        <div id="${groupId}" style="display:none;">
          ${group.map(mopRow).join('')}
        </div>`;
      }).join('');
    } else {
      list.innerHTML = mops.map(mopRow).join('');
    }
  }

  function formatCallDate(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit'}) + ' · ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    } catch(e){ return '—'; }
  }

  function stageMark(status){
    if(status === 'done') return '✓';
    if(status === 'partial') return '±';
    return '✗';
  }

  function openCallDetail(callId){
    const call = currentCalls.find(c => c.id === callId) || bestCalls.find(c => c.id === callId);
    if(!call) return;
    currentOpenCallId = callId;
    const mop = mopMap[call.mopId] || companyMopMap[call.mopId] || { name: 'МОП' };
    const a = call.aiAnalysis || {};
    const stages = a.stages || [];
    const checklist = a.checklist || [];
    const strengths = a.strengths || [];
    const weaknesses = a.weaknesses || [];
    const objections = a.objections || [];
    const isPending = !call.analystReview || call.analystReview.status === 'pending';
    const score = typeof a.score === 'number' ? a.score : '—';

    document.getElementById('callTitle').textContent = `Звонок · ${mop.name}`;
    const pillEl = document.getElementById('callPill');
    pillEl.className = 'pill ' + (score !== '—' && score < 6 ? 'bad' : 'good');
    pillEl.textContent = (score !== '—' && score < 6 ? 'Низкий балл · ' : 'Балл · ') + score;

    document.getElementById('callMeta').innerHTML = `
      <div><b>${formatCallDate(call.date)}</b>Дата и время</div>
      <div><b>${call.durationSeconds ? Math.round(call.durationSeconds/60) + ' мин' : '—'}</b>Длительность</div>
      <div><b>Ручной ввод</b>Источник</div>`;

    document.getElementById('callTranscript').innerHTML = call.transcript
      ? call.transcript.split('\n').filter(Boolean).map(line => `<div class="t-line"><span>${line}</span></div>`).join('')
      : '<div style="color:var(--gray); font-size:13.5px; padding:20px 0;">Текст расшифровки не был сохранён при ручном добавлении звонка.</div>';

    const stagesDone = stages.filter(s => s.status === 'done').length;
    document.getElementById('callScoreStrip').innerHTML = `
      <div class="score-mini"><div class="v">${score}</div><div class="l">Оценка /10</div></div>
      <div class="score-mini"><div class="v">${stagesDone}/${stages.length || 6}</div><div class="l">Этапов полностью</div></div>
      <div class="score-mini"><div class="v">${objections.length}</div><div class="l">Возражений в звонке</div></div>`;

    document.getElementById('callStageList').innerHTML = stages.map(s => `
      <div class="stage-row ${s.status}"><span class="mk">${stageMark(s.status)}</span><span class="t">${s.id}. ${s.name}</span>${s.comment ? `<span class="c">${s.comment}</span>` : ''}</div>
    `).join('');

    document.getElementById('callStrengths').innerHTML = strengths.length
      ? strengths.map(s => `<p>+ ${s}</p>`).join('')
      : '<p style="color:var(--gray);">Не выделено</p>';
    document.getElementById('callWeaknesses').innerHTML = weaknesses.length
      ? weaknesses.map(w => `<p>– ${w}</p>`).join('')
      : '<p style="color:var(--gray);">Не выделено</p>';

    document.getElementById('callObjTable').innerHTML = objections.length
      ? objections.map(o => `<tr><td>«${o.objection}»</td><td>${o.handling}</td></tr>`).join('')
      : '<tr><td colspan="2" style="color:var(--gray);">Возражений не зафиксировано</td></tr>';

    document.getElementById('callReviewStatus').innerHTML = isPending
      ? '<span class="pill wait">Ожидает подтверждения</span>'
      : '<span class="pill good">Подтверждено аналитиком</span>';
    document.getElementById('callRecommendation').textContent = a.recommendation || '—';
    document.getElementById('callComment').value = (call.analystReview && call.analystReview.comment) || '';

    const confirmBtn = document.getElementById('callConfirmBtn');
    confirmBtn.textContent = isPending ? `Подтвердить оценку ${score}` : 'Оценка подтверждена';
    confirmBtn.disabled = !isPending;

    const deleteBtn = document.getElementById('callDeleteBtn');
    if(deleteBtn){ deleteBtn.disabled = false; deleteBtn.textContent = 'Удалить звонок'; }

    const totalItems = checklist.reduce((sum, b) => sum + b.items.length, 0);
    const doneItems = checklist.reduce((sum, b) => sum + b.items.filter(i => i.done).length, 0);
    document.getElementById('callChecklistTitle').textContent = `Чек-лист МОП — ${doneItems} из ${totalItems || 34} пунктов`;
    const failedBlocks = checklist.filter(b => b.items.some(i => !i.done)).map(b => b.block);
    document.getElementById('callChecklistNote').textContent = failedBlocks.length
      ? `Провал в блоке: ${failedBlocks.map(b => `«${b}»`).join(', ')}.`
      : 'Все пункты чек-листа закрыты.';

    document.getElementById('callChecklist').innerHTML = checklist.map(b => {
      const blockDone = b.items.filter(i => i.done).length;
      return `<div class="cl-block">
        <h5>${b.block} — ${blockDone}/${b.items.length}</h5>
        ${b.items.map(i => `<div class="cl-item ${i.done ? 'done' : 'bad'}"><span class="mk">${i.done ? '✓' : '✗'}</span>${i.text}</div>`).join('')}
      </div>`;
    }).join('');

    go('call');
  }

  function buildChecklistEmailHtml(call, mopName, branchName){
    const a = call.aiAnalysis || {};
    const score = typeof a.score === 'number' ? a.score : '—';
    const stages = a.stages || [];
    const checklist = a.checklist || [];
    const strengths = a.strengths || [];
    const weaknesses = a.weaknesses || [];
    const recommendation = a.recommendation || '';

    const stageMarkText = s => s === 'done' ? '✓' : (s === 'partial' ? '±' : '✗');
    const stageColor = s => s === 'done' ? '#2E7D32' : (s === 'partial' ? '#9C7A1E' : '#C0392B');

    const stagesHtml = stages.map(st => `
      <tr>
        <td style="padding:4px 8px 4px 0; color:${stageColor(st.status)}; font-weight:bold; width:20px;">${stageMarkText(st.status)}</td>
        <td style="padding:4px 0; color:#1A1A1A;">${st.id}. ${st.name}${st.comment ? ` — <span style="color:#595959;">${st.comment}</span>` : ''}</td>
      </tr>`).join('');

    const checklistHtml = checklist.map(block => {
      const done = block.items.filter(i => i.done).length;
      const itemsHtml = block.items.map(i => `
        <tr>
          <td style="padding:2px 8px 2px 16px; color:${i.done ? '#2E7D32' : '#C0392B'}; font-weight:bold; width:20px;">${i.done ? '✓' : '✗'}</td>
          <td style="padding:2px 0; color:${i.done ? '#1A1A1A' : '#8A8A8A'};">${i.text}</td>
        </tr>`).join('');
      return `
        <tr><td colspan="2" style="padding:10px 0 4px; font-weight:bold; color:#1A1A1A; border-top:1px solid #eee;">${block.block} — ${done}/${block.items.length}</td></tr>
        ${itemsHtml}`;
    }).join('');

    const strengthsHtml = strengths.map(s => `<div style="color:#2E7D32; margin-bottom:3px;">+ ${s}</div>`).join('');
    const weaknessesHtml = weaknesses.map(w => `<div style="color:#C0392B; margin-bottom:3px;">– ${w}</div>`).join('');

    return `
      <table style="width:100%; max-width:600px; border-collapse:collapse; font-family:Arial,sans-serif; font-size:14px;">
        <tr><td colspan="2" style="padding-bottom:10px;">
          <b>${mopName}</b> · ${branchName}<br>
          <span style="color:#595959;">Звонок ${formatCallDate(call.date)} · Оценка <b style="color:#E8641F;">${score}/10</b></span>
        </td></tr>
        <tr><td colspan="2" style="padding:10px 0 4px; font-weight:bold; border-top:1px solid #eee;">Этапы звонка</td></tr>
        ${stagesHtml}
        ${checklistHtml}
        <tr><td colspan="2" style="padding:14px 0 4px; font-weight:bold; border-top:1px solid #eee;">Сильные стороны</td></tr>
        <tr><td colspan="2">${strengthsHtml || '<span style="color:#8A8A8A;">Не выделено</span>'}</td></tr>
        <tr><td colspan="2" style="padding:10px 0 4px; font-weight:bold;">Слабые стороны</td></tr>
        <tr><td colspan="2">${weaknessesHtml || '<span style="color:#8A8A8A;">Не выделено</span>'}</td></tr>
        ${recommendation ? `<tr><td colspan="2" style="padding:14px 0 4px; font-weight:bold; border-top:1px solid #eee;">Рекомендация специалисту</td></tr><tr><td colspan="2" style="color:#1A1A1A;">${recommendation}</td></tr>` : ''}
      </table>`;
  }

  function sendChecklistEmail(call, mop){
    if(typeof emailjs === 'undefined'){ console.warn('EmailJS недоступен — письмо не отправлено.'); return; }
    if(!mop || !mop.ropId){ return; }
    const ropEmail = ROP_EMAILS[mop.ropId];
    if(!ropEmail){ console.warn('Нет email для ropId:', mop.ropId); return; }
    const rop = companyRopMap[mop.ropId] || ropMap[mop.ropId];
    const branchName = rop ? (rop.branch || rop.name) : '';

    const checklistHtml = buildChecklistEmailHtml(call, mop.name || 'МОП', branchName);

    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: ropEmail,
      mop_name: mop.name || 'МОП',
      call_date: formatCallDate(call.date),
      checklist_html: checklistHtml
    }).then(() => {
      console.log('Письмо с чек-листом отправлено на', ropEmail);
    }).catch(err => {
      console.error('Не удалось отправить письмо с чек-листом:', err);
    });
  }

  async function confirmCurrentCall(){
    if(!currentOpenCallId) return;
    const btn = document.getElementById('callConfirmBtn');
    const comment = document.getElementById('callComment').value;
    btn.disabled = true;
    btn.textContent = 'Сохраняем...';
    try{
      await db.collection('calls').doc(currentOpenCallId).update({
        'analystReview.status': 'confirmed',
        'analystReview.comment': comment,
        'analystReview.confirmedAt': new Date().toISOString()
      });
      const call = currentCalls.find(c => c.id === currentOpenCallId) || bestCalls.find(c => c.id === currentOpenCallId);
      if(call){
        call.analystReview = { status: 'confirmed', comment, confirmedAt: new Date().toISOString() };
        const mop = mopMap[call.mopId] || companyMopMap[call.mopId];
        sendChecklistEmail(call, mop);
      }
      document.getElementById('callReviewStatus').innerHTML = '<span class="pill good">Подтверждено аналитиком</span>';
      btn.textContent = 'Оценка подтверждена';
    } catch(e){
      console.error(e);
      alert('Не удалось подтвердить — проверьте права доступа в Firestore Rules (нужно allow update для /calls).');
      btn.disabled = false;
      btn.textContent = 'Подтвердить оценку';
    }
  }

  // ---------- УДАЛЕНИЕ ЗВОНКА ----------
  // Использует currentOpenCallId (тот же id, что и confirmCurrentCall) и
  // удаляет документ прямо из Firestore. После успеха убирает звонок из
  // локальных массивов currentCalls/bestCalls, чтобы он сразу пропал из
  // списков без перезагрузки страницы, и возвращает на экран, откуда
  // открывали карточку (returnScreen — та же переменная, что и у «← Назад»).
  async function deleteCurrentCall(){
    if(!currentOpenCallId) return;

    if(!confirm('Удалить этот звонок безвозвратно? Это действие нельзя отменить.')) return;

    const btn = document.getElementById('callDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Удаляю...';

    try{
      await db.collection('calls').doc(currentOpenCallId).delete();

      currentCalls = currentCalls.filter(c => c.id !== currentOpenCallId);
      bestCalls = bestCalls.filter(c => c.id !== currentOpenCallId);

      const goBackTo = returnScreen || 'dashboard';
      currentOpenCallId = null;

      if(goBackTo === 'dashboard' && currentUserData){
        renderRealDashboard(currentUserData, currentRopData, currentMops, currentCalls);
      }
      if(goBackTo === 'manager' && currentManagerMopId){
        openManagerDetail(currentManagerMopId);
        return; // openManagerDetail уже вызывает go('manager')
      }
      if(goBackTo === 'best'){
        renderBestCalls();
      }

      go(goBackTo);
    } catch(e){
      console.error(e);
      alert('Не удалось удалить звонок — проверьте права доступа в Firestore Rules (нужно allow delete для /calls).');
      btn.disabled = false;
      btn.textContent = 'Удалить звонок';
    }
  }

  // ---------- ADD CALL (manual entry via Claude chat) ----------
  let currentRopId = null;
  let currentMops = [];
  let currentCalls = [];
  let currentOpenCallId = null;
  let mopMap = {};
  let ropMap = {};
  let isAdminUser = false;
  let currentUserData = null;
  let currentRopData = null;
  let currentWeekOffset = 0;

  // ---------- BEST CALLS (company-wide showcase, score >= 8) ----------
  const BEST_SCORE_THRESHOLD = 8;
  let bestCalls = [];
  let bestCallsLoaded = false;
  let companyMopMap = {};
  let companyRopMap = {};
  let returnScreen = 'dashboard';

  // ---------- CUSTOM BUSINESS GAMES ----------
  let customGames = [];

  function toggleAddGameForm(show){
    const form = document.getElementById('addGameForm');
    const btn = document.getElementById('showAddGameBtn');
    if(!form || !btn) return;
    form.style.display = show ? 'block' : 'none';
    btn.style.display = show ? 'none' : 'flex';
    if(!show){
      document.getElementById('newGameTitle').value = '';
      document.getElementById('newGameDuration').value = '';
      document.getElementById('newGameParticipants').value = '';
      document.getElementById('newGameDesc').value = '';
      document.getElementById('newGameSteps').value = '';
      const err = document.getElementById('addGameError');
      if(err) err.style.display = 'none';
    }
  }

  function applyGamesAccess(){
    const btn = document.getElementById('showAddGameBtn');
    if(!btn) return;
    btn.style.display = isAdminUser ? 'flex' : 'none';
    if(!isAdminUser){ toggleAddGameForm(false); }
  }

  async function loadCustomGames(){
    try{
      const snap = await db.collection('games').orderBy('createdAt', 'desc').get();
      customGames = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e){
      console.error('Не удалось загрузить игры:', e);
      customGames = [];
    }
    renderCustomGames();
  }

  function renderCustomGames(){
    const grid = document.getElementById('gamesGrid');
    if(!grid) return;
    document.querySelectorAll('.game-card[data-custom="1"]').forEach(el => el.remove());
    customGames.forEach(g => {
      const steps = Array.isArray(g.steps) ? g.steps : [];
      const card = document.createElement('div');
      card.className = 'game-card';
      card.setAttribute('data-custom', '1');
      card.onclick = function(){ this.classList.toggle('open'); };
      card.innerHTML = `
        <div class="gh"><h4>${g.title || 'Без названия'}</h4></div>
        <div class="meta">${g.duration ? `<span>${g.duration}</span>` : ''}${g.participants ? `<span>${g.participants}</span>` : ''}</div>
        <p class="desc">${g.description || ''}</p>
        <div class="expand">
          <h5>Как проводить</h5>
          <ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>
          <span class="toggle">Свернуть ↑</span>
        </div>`;
      grid.appendChild(card);
    });
  }

  async function saveNewGame(){
    const errBox = document.getElementById('addGameError');
    const btn = document.getElementById('saveGameBtn');
    errBox.style.display = 'none';

    const title = document.getElementById('newGameTitle').value.trim();
    const duration = document.getElementById('newGameDuration').value.trim();
    const participants = document.getElementById('newGameParticipants').value.trim();
    const description = document.getElementById('newGameDesc').value.trim();
    const stepsRaw = document.getElementById('newGameSteps').value;
    const steps = stepsRaw.split('\n').map(s => s.trim()).filter(Boolean);

    if(!title || !description || steps.length === 0){
      errBox.style.display = 'block';
      errBox.textContent = 'Заполните название, описание и хотя бы один шаг «Как проводить».';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохраняем...';
    try{
      await db.collection('games').add({
        title, duration, participants, description, steps,
        createdAt: new Date().toISOString(),
        createdBy: currentUserData ? currentUserData.name : ''
      });
      await loadCustomGames();
      toggleAddGameForm(false);
    } catch(e){
      console.error(e);
      errBox.style.display = 'block';
      errBox.textContent = 'Не удалось сохранить игру. Проверьте права доступа.';
    }
    btn.disabled = false;
    btn.textContent = 'Сохранить игру';
  }

  const CALL_PROMPT_TEMPLATE = `Ты — аналитик отдела контроля качества в компании, продающей корпоративный доступ к правовой информационной системе (Актион). Разбери расшифровку звонка менеджера (МОП) с клиентом строго по чек-листу SCG ниже и верни ТОЛЬКО валидный JSON, без пояснений до или после.

ЭТАПЫ ЗВОНКА (оцени каждый: "done" — выполнен полностью, "partial" — частично, "bad" — не выполнен, с коротким комментарием на русском только для partial/bad):
0. Установление контакта — тёплое приветствие по имени-отчеству, без фразы "удобно ли сейчас говорить", сразу назван повод звонка
1. До демонстрации — озвучен регламент разговора (сколько займёт и что по шагам), заданы открытые вопросы из чек-листа ниже
2. По ходу демонстрации — закрытые вопросы для обратной связи (этот блок оценивается только качественно, отдельного списка вопросов нет)
3. Перед ценой — уточнены вопросы о процессе согласования покупки
4. Презентация цены — цена названа в 3 форматах с резюме ценности
5. Закрытие — зафиксированы конкретные договорённости

ЧЕК-ЛИСТ МОП (отметь true/false для каждого пункта — задан ли этот вопрос клиенту и получен ли содержательный ответ):

Блок "Контакт" (2 пункта):
1. Тёплое приветствие без фразы "удобно ли сейчас говорить"
2. Сразу назван повод звонка

Блок "До демонстрации" (21 пункт):
1. Чем занимается компания?
2. Какой правовой системой (СПС) пользуетесь или пользовались?
3. Сколько платите или платили?
4. До какого срока действует текущая подписка?
5. Какие отделы представлены в компании?
6. Сколько сотрудников в подразделении?
7. Как распределены задачи между сотрудниками?
8. Кто принимает решение о подписке?
9. Как у вас происходит процесс согласования покупки?
10. Кто у вас пользуется системой (какие отделы, сотрудники)?
11. Сколько одновременных доступов у вас сейчас?
12. Сколько одновременных доступов удобно было бы вам?
13. Что чаще всего ищете в системе?
14. Что добавили бы в текущую подписку?
15. Как часто берёте демо-доступ нашей системы?
16. Какие рабочие вопросы удалось решить с нашей системой?
17. Что нравится в нашей системе больше всего?
18. Как повышаете квалификацию? Какие посещаете семинары/вебинары?
19. Какая сумма выделяется в компании на повышение квалификации/семинары/вебинары?
20. Какие журналы выписываете/покупаете? На какие журналы оформлена подписка?
21. Какая сумма выделена в компании на подписные издания/журналы?

Блок "Перед ценой" (3 пункта):
1. Как у вас происходит процесс согласования покупки?
2. Кто ещё влияет на принятие решения?
3. Каким способом обмениваетесь документами (ЭДО, бумага)?

Блок "Презентация цены" (4 пункта):
1. Озвучена цена в трёх форматах: за год / за месяц / за день?
2. Сразу после цены резюмировано, что именно входит в подписку?
3. Названа выгода/акция (скидка, фиксация цены) со сроком действия?
4. Выяснено, что должно произойти, чтобы клиент принял решение о покупке/продлении?

Блок "Закрытие" (4 пункта):
1. Зафиксирована дата и время следующего контакта
2. Зафиксировано, что именно будет выслано клиенту
3. Зафиксировано, кому передать материалы (если решение не за собеседником)
4. Зафиксировано микро-обязательство клиента до следующего звонка

ВАЖНО: блок "По ходу демонстрации" НЕ включай в checklist — по нему пока нет фиксированного списка вопросов, оценивай только через stages (этап id 2).

Также определи:
- score: оценка звонка от 0 до 10
- durationSeconds: примерная длительность звонка в секундах (если не ясно из текста — поставь 0)
- strengths: список сильных сторон (короткие пункты на русском, без "+")
- weaknesses: список слабых сторон (короткие пункты на русском, без "-")
- objections: список возражений клиента, каждое — {"objection": "...", "handling": "как отработано или не отработано"}
- recommendation: одна-две фразы конкретной рекомендации специалисту

Верни JSON СТРОГО в этой структуре (все ключи обязательны, checklist — ровно 4 блока: Контакт, До демонстрации, Перед ценой, Презентация цены, Закрытие — БЕЗ блока "По ходу демонстрации"):
{
  "score": 4.2,
  "durationSeconds": 400,
  "stages": [
    {"id": 0, "name": "Установление контакта", "status": "done", "comment": ""},
    {"id": 1, "name": "До демонстрации", "status": "done", "comment": ""},
    {"id": 2, "name": "По ходу демонстрации", "status": "done", "comment": ""},
    {"id": 3, "name": "Перед ценой", "status": "partial", "comment": "..."},
    {"id": 4, "name": "Презентация цены", "status": "bad", "comment": "..."},
    {"id": 5, "name": "Закрытие", "status": "bad", "comment": "..."}
  ],
  "checklist": [
    {"block": "Контакт", "items": [{"text": "...", "done": true}]},
    {"block": "До демонстрации", "items": [...]},
    {"block": "Перед ценой", "items": [...]},
    {"block": "Презентация цены", "items": [...]},
    {"block": "Закрытие", "items": [...]}
  ],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "objections": [{"objection": "...", "handling": "..."}],
  "recommendation": "..."
}

Ниже вставь текст расшифровки звонка и отправь сообщение:

РАСШИФРОВКА ЗВОНКА:
[вставьте сюда текст звонка]`;

  function renderPromptBox(){
    const box = document.getElementById('promptBox');
    if(box) box.value = CALL_PROMPT_TEMPLATE;
  }

  function copyPrompt(){
    const box = document.getElementById('promptBox');
    box.select();
    navigator.clipboard.writeText(box.value).then(() => {
      alert('Промпт скопирован — вставьте его в чат Claude и допишите текст звонка в конце.');
    }).catch(() => {
      document.execCommand('copy');
      alert('Промпт скопирован.');
    });
  }

  function applyAddCallAccess(){
    const notice = document.getElementById('addCallRopNotice');
    const mopSel = document.getElementById('addCallMop');
    const jsonBox = document.getElementById('addCallJson');
    const saveBtn = document.getElementById('addCallBtn');
    const copyBtn = document.getElementById('copyPromptBtn');
    if(!notice || !mopSel || !jsonBox || !saveBtn) return;

    const allowed = isAdminUser;
    notice.style.display = allowed ? 'none' : 'block';
    mopSel.disabled = !allowed;
    jsonBox.disabled = !allowed;
    saveBtn.disabled = !allowed;
    if(copyBtn) copyBtn.disabled = !allowed;

    [mopSel, jsonBox, saveBtn, copyBtn].forEach(el => {
      if(!el) return;
      el.style.opacity = allowed ? '1' : '0.5';
      el.style.cursor = allowed ? '' : 'not-allowed';
    });
  }

  function populateMopSelect(mops){
    const sel = document.getElementById('addCallMop');
    if(!sel) return;
    if(mops.length === 0){
      sel.innerHTML = '<option value="">Нет МОП в команде</option>';
      return;
    }
    sel.innerHTML = mops.map(m => {
      const branchTag = isAdminUser && ropMap[m.ropId] ? ` — ${ropMap[m.ropId].branch || ropMap[m.ropId].name}` : '';
      return `<option value="${m.id}">${m.name || 'Без имени'}${branchTag}</option>`;
    }).join('');
  }

  function setAddCallMsg(kind, msg){
    const errBox = document.getElementById('addCallError');
    const okBox = document.getElementById('addCallSuccess');
    errBox.style.display = 'none';
    okBox.style.display = 'none';
    if(kind === 'error'){ errBox.textContent = msg; errBox.style.display = 'block'; }
    if(kind === 'ok'){ okBox.textContent = msg; okBox.style.display = 'block'; }
  }

  async function saveCallFromJson(){
    setAddCallMsg(null, '');
    const btn = document.getElementById('addCallBtn');
    const mopId = document.getElementById('addCallMop').value;
    const raw = document.getElementById('addCallJson').value.trim();

    if(!mopId){
      setAddCallMsg('error', 'Выберите МОП.');
      return;
    }
    if(!raw){
      setAddCallMsg('error', 'Вставьте ответ Claude в формате JSON.');
      return;
    }

    let analysis;
    try{
      const cleaned = raw.replace(/^```json\s*|\s*```$/gm, '').trim();
      analysis = JSON.parse(cleaned);
    } catch(e){
      setAddCallMsg('error', 'Не удалось разобрать JSON — проверьте, что скопирован весь ответ целиком, без лишнего текста до или после.');
      return;
    }

    const required = ['score', 'stages', 'checklist', 'strengths', 'weaknesses', 'objections', 'recommendation'];
    const missing = required.filter(k => !(k in analysis));
    if(missing.length){
      setAddCallMsg('error', `В JSON не хватает полей: ${missing.join(', ')}. Проверьте, что Claude вернул полный ответ по шаблону.`);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохраняем...';

    const targetMop = mopMap[mopId];
    const ropIdForCall = isAdminUser ? (targetMop ? targetMop.ropId : null) : currentRopId;
    if(!ropIdForCall){
      setAddCallMsg('error', 'Не удалось определить филиал этого МОП.');
      btn.disabled = false;
      btn.textContent = 'Сохранить звонок';
      return;
    }

    try{
      await db.collection('calls').add({
        mopId: mopId,
        ropId: ropIdForCall,
        date: new Date().toISOString(),
        durationSeconds: analysis.durationSeconds || 0,
        transcript: '',
        aiAnalysis: {
          score: analysis.score,
          stages: analysis.stages,
          checklist: analysis.checklist,
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          objections: analysis.objections,
          recommendation: analysis.recommendation
        },
        analystReview: { status: 'pending', comment: '', confirmedAt: null }
      });
      setAddCallMsg('ok', 'Звонок сохранён и появится в дашборде со статусом «ожидает подтверждения».');
      document.getElementById('addCallJson').value = '';
    } catch(e){
      console.error(e);
      setAddCallMsg('error', 'Не удалось сохранить — проверьте подключение и права доступа.');
    }
    btn.disabled = false;
    btn.textContent = 'Сохранить звонок';
  }

  function populateSettings(userData, ropData){
    document.getElementById('settingsName').textContent = userData.name || '—';
    document.getElementById('settingsEmail').textContent = (auth.currentUser && auth.currentUser.email) || '—';
    document.getElementById('settingsRole').textContent = userData.role === 'admin' ? 'Администратор' : 'РОП';
    document.getElementById('settingsBranch').textContent = ropData.branch || '—';
  }

  function changePasswordDirect(){
    const msgBox = document.getElementById('settingsMsg');
    const btn = document.getElementById('changePasswordBtn');
    const currentPwd = document.getElementById('currentPasswordInput').value;
    const newPwd = document.getElementById('newPasswordInput').value;
    const user = auth.currentUser;

    msgBox.style.display = 'none';

    if(!newPwd || newPwd.length < 6){
      msgBox.style.display = 'block';
      msgBox.style.color = 'var(--bad)';
      msgBox.textContent = 'Новый пароль должен быть не короче 6 символов.';
      return;
    }
    if(!user){
      msgBox.style.display = 'block';
      msgBox.style.color = 'var(--bad)';
      msgBox.textContent = 'Сессия не активна — войдите заново.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохраняем...';

    user.updatePassword(newPwd).then(() => {
      msgBox.style.display = 'block';
      msgBox.style.color = 'var(--good)';
      msgBox.textContent = 'Пароль изменён. Используйте новый пароль при следующем входе.';
      document.getElementById('currentPasswordInput').value = '';
      document.getElementById('newPasswordInput').value = '';
      btn.disabled = false;
      btn.textContent = 'Сохранить новый пароль';
    }).catch(err => {
      if(err.code === 'auth/requires-recent-login'){
        if(!currentPwd){
          msgBox.style.display = 'block';
          msgBox.style.color = 'var(--bad)';
          msgBox.textContent = 'Сессия давняя — введите текущий пароль в поле выше и попробуйте снова.';
          btn.disabled = false;
          btn.textContent = 'Сохранить новый пароль';
          return;
        }
        const cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPwd);
        user.reauthenticateWithCredential(cred).then(() => {
          return user.updatePassword(newPwd);
        }).then(() => {
          msgBox.style.display = 'block';
          msgBox.style.color = 'var(--good)';
          msgBox.textContent = 'Пароль изменён. Используйте новый пароль при следующем входе.';
          document.getElementById('currentPasswordInput').value = '';
          document.getElementById('newPasswordInput').value = '';
          btn.disabled = false;
          btn.textContent = 'Сохранить новый пароль';
        }).catch(err2 => {
          console.error(err2);
          msgBox.style.display = 'block';
          msgBox.style.color = 'var(--bad)';
          msgBox.textContent = err2.code === 'auth/wrong-password' ? 'Текущий пароль указан неверно.' : 'Не удалось сменить пароль. Попробуйте позже.';
          btn.disabled = false;
          btn.textContent = 'Сохранить новый пароль';
        });
      } else {
        console.error(err);
        msgBox.style.display = 'block';
        msgBox.style.color = 'var(--bad)';
        msgBox.textContent = 'Не удалось сменить пароль. Попробуйте позже.';
        btn.disabled = false;
        btn.textContent = 'Сохранить новый пароль';
      }
    });
  }

  function doLogout(){
    if(!auth){ location.reload(); return; }
    auth.signOut().then(() => {
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      setLoginError('');
      go('login');
    });
  }

  // Метка успешной загрузки: если её нет, значит portal.js не долетел.
  window.__portalReady = true;
  console.log('portal.js загружен полностью. Firebase:', firebaseReady ? 'подключён' : 'НЕДОСТУПЕН');
