// Additional product flows: question papers, leave escalation, and language options.
pages.papers=['Question papers','Questions and marks in · automatic print layout'];
en.papers='Question papers';
hi.papers='प्रश्न पत्र';
ur.papers='سوالیہ پرچے';
const featureTitles={
  en:{home:'Overview',attendance:'Attendance',hostel:'Hostel & meals',students:'Students',papers:'Question papers',health:'Student health',kitchen:'Kitchen stock',reports:'Reports & insights',staff:'Our staff',fees:'Fees & family support'},
  hi:{home:'आज का हाल',attendance:'हाज़िरी',hostel:'छात्रावास और भोजन',students:'बच्चे',papers:'प्रश्न पत्र',health:'बच्चों की सेहत',kitchen:'रसोई का सामान',reports:'रिपोर्ट और जानकारी',staff:'हमारे कर्मचारी',fees:'फीस और परिवार'},
  ur:{home:'جائزہ',attendance:'حاضری',hostel:'ہاسٹل اور کھانا',students:'طلبہ',papers:'سوالیہ پرچے',health:'طلبہ کی صحت',kitchen:'باورچی خانے کا ذخیرہ',reports:'رپورٹس اور معلومات',staff:'عملہ',fees:'فیس اور اہل خانہ'}
};
const featureSubtitles={
  hi:{home:'आज आपके स्कूल में क्या हो रहा है, यहाँ देखें।',attendance:'कागज़ वाले रजिस्टर के उसी क्रम में हाज़िरी लें।',hostel:'छात्रावास के बच्चों की सुबह और शाम की हाज़िरी।',students:'बच्चों, परिवार और स्कूल की जानकारी एक जगह।',papers:'सवाल और अंक लिखें; कागज़ अपने आप तैयार होगा।',health:'हर बच्चे की सेहत का सुरक्षित रिकॉर्ड।',kitchen:'रसोई के सामान और अगली खरीदारी की जानकारी।',reports:'स्कूल, छात्रावास और खर्च की साफ़ रिपोर्ट।'},
  ur:{home:'آج اسکول میں کیا ہو رہا ہے، یہاں دیکھیں۔',attendance:'کاغذی رجسٹر کے اسی نمبر وار ترتیب میں حاضری لیں۔',hostel:'ہاسٹل میں رہنے والے بچوں کی صبح اور شام کی حاضری۔',students:'بچوں، خاندان اور اسکول کی معلومات ایک جگہ۔',papers:'صرف سوال اور نمبر درج کریں؛ پرچہ خود ترتیب پائے گا۔',health:'ہر بچے کی صحت کا محفوظ ریکارڈ۔',kitchen:'باورچی خانے کے سامان اور خریداری کی معلومات۔',reports:'اسکول، ہاسٹل اور اخراجات کی صاف رپورٹ۔'}
};
const originalRender=render;
render=function(){
  if(currentPage==='papers') document.getElementById('contentArea').innerHTML=renderQuestionPapers();
  else originalRender();
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.page===currentPage));
  document.getElementById('crumbCurrent').textContent=featureTitles[currentLanguage]?.[currentPage]||pages[currentPage][0];
  const pageTitle=document.querySelector('.page-heading h1');
  if(pageTitle) pageTitle.textContent=featureTitles[currentLanguage]?.[currentPage]||pages[currentPage][0];
  const eyebrow=document.querySelector('.page-heading .eyebrow');if(eyebrow)eyebrow.innerHTML=`Pillar Campus <span>·</span> ${localDateLabel()}`;
  const pageSubtitle=document.querySelector('.page-heading .page-subtitle');
  if(pageSubtitle&&featureSubtitles[currentLanguage]?.[currentPage]) pageSubtitle.textContent=featureSubtitles[currentLanguage][currentPage];
  document.getElementById('dateLabel').textContent=localDateLabel();
  if(currentPage==='home') document.querySelector('.table-card')?.insertAdjacentHTML('beforebegin',dashboardInsights());
  if(currentPage==='hostel') {
    const awayCard=[...document.querySelectorAll('.side-stack .info-card')].find(card=>card.querySelector('h3')?.textContent.includes('Children away'));
    if(awayCard) awayCard.outerHTML=renderLeaveCard();
  }
  document.querySelectorAll('.nav-item').forEach(item=>{const name=item.dataset.page;const label=item.querySelector('.nav-copy b');if(label&&featureTitles[currentLanguage]?.[name])label.textContent=featureTitles[currentLanguage][name]});
  bindPaperInputs();
};

function dashboardInsights(){return ``}

function totalPaperMarks(){return paperQuestions.reduce((total,q)=>total+(Number(q.marks)||0),0)}
function paperCopy(){const questions=paperQuestions.map((q,index)=>`<li>${esc(q.text||'Write the question here')} <span class="paper-question-marks">(${Number(q.marks)||0} marks)</span></li>`).join('');return `<section class="paper-copy"><h2 class="paper-institution">${esc(paperData.institution)}</h2><div class="paper-title">${esc(paperData.exam)} · ${esc(paperData.subject)}</div><div class="paper-details"><div><span>Class: ${esc(paperData.className)}</span><span>Date: ${esc(paperData.date)}</span></div><div><span>Time: ${esc(paperData.duration)}</span><span>Maximum marks: ${totalPaperMarks()}</span></div></div><p class="paper-instructions">Answer all questions. Write your roll number clearly.</p><ol class="paper-preview-questions">${questions||'<li class="paper-empty">Add questions to preview the paper.</li>'}</ol><div class="paper-copy-footer">Teacher’s signature: ____________________</div></section>`}
function renderQuestionPapers(){return `${topHeading('Question papers <span class="hindi-inline">प्रश्न पत्र</span>','Enter each question and its marks. The page formats two copies for A4 printing.',button('Print 2 copies · A4','paper-print','button button-primary','▤'))}<div class="summary-banner"><span class="banner-mark">▤</span><div><b>Two identical papers on one A4 sheet <span class="hindi-inline">एक A4 शीट पर दो समान प्रश्न पत्र</span></b><small>Type the question and marks. The total and print layout update automatically.</small></div><span class="paper-demo-tag">Draft preview</span></div><div class="paper-layout"><section class="card paper-editor"><h3>Paper details <span class="hindi-inline">परीक्षा की जानकारी</span></h3><p>Set the class and exam once. For each question, enter only its wording and marks.</p><div class="paper-meta-grid"><div class="field"><label for="paperInstitution">School / institution</label><input id="paperInstitution" data-paper="institution" value="${esc(paperData.institution)}"></div><div class="field"><label for="paperExam">Exam name</label><input id="paperExam" data-paper="exam" value="${esc(paperData.exam)}"></div><div class="field"><label for="paperClass">Class</label><input id="paperClass" data-paper="className" value="${esc(paperData.className)}"></div><div class="field"><label for="paperSubject">Subject</label><input id="paperSubject" data-paper="subject" value="${esc(paperData.subject)}"></div><div class="field"><label for="paperDuration">Time allowed</label><input id="paperDuration" data-paper="duration" value="${esc(paperData.duration)}"></div><div class="field"><label for="paperDate">Exam date</label><input id="paperDate" data-paper="date" value="${esc(paperData.date)}"></div></div><div class="toolbar-line" style="justify-content:space-between;margin-top:9px"><b style="font-size:10px">Questions <span class="hindi-inline">سوالات</span></b><button class="button button-small button-quiet" data-action="paper-add">＋ Add question</button></div><div class="paper-question-list">${paperQuestions.map((q,i)=>`<div class="paper-question-row"><span class="paper-q-index">${i+1}.</span><textarea data-question="${i}" aria-label="Question ${i+1}" placeholder="Write question ${i+1}">${esc(q.text)}</textarea><input data-marks="${i}" type="number" min="0" step="1" value="${Number(q.marks)||0}" aria-label="Marks for question ${i+1}"><button class="paper-remove" data-action="paper-remove" data-index="${i}" aria-label="Remove question ${i+1}">×</button></div>`).join('')}</div><div class="paper-total"><span>Total marks <span class="hindi-inline">کل نمبر</span></span><b id="paperTotal">${totalPaperMarks()}</b></div><button class="button button-primary" style="width:100%" data-action="paper-print">Print 2 copies on A4 <span class="hindi-inline">· A4 پرنٹ کریں</span></button></section><section class="paper-preview-wrap"><div class="paper-preview-label"><span><b>Print preview</b> · A4 portrait</span><span>Two cut-out copies</span></div><div class="paper-preview-page" id="paperPreview">${paperCopy()}${paperCopy()}</div><div class="paper-print-actions"><button class="button button-primary" data-action="paper-print">Print / Save as PDF</button><button class="button button-quiet" data-action="paper-reset">Start a new paper</button></div><p class="paper-print-hint">In the print window, choose A4 paper and “Actual size” or 100% scale.</p></section></div>`}
function bindPaperInputs(){
  document.querySelectorAll('[data-paper]').forEach(input=>input.addEventListener('input',()=>{paperData[input.dataset.paper]=input.value;updatePaperPreview()}));
  document.querySelectorAll('[data-question]').forEach(input=>input.addEventListener('input',()=>{paperQuestions[Number(input.dataset.question)].text=input.value;updatePaperPreview()}));
  document.querySelectorAll('[data-marks]').forEach(input=>input.addEventListener('input',()=>{paperQuestions[Number(input.dataset.marks)].marks=Math.max(0,Number(input.value)||0);updatePaperPreview()}));
}
function updatePaperPreview(){const total=document.getElementById('paperTotal');if(total)total.textContent=totalPaperMarks();const preview=document.getElementById('paperPreview');if(preview)preview.innerHTML=paperCopy()+paperCopy()}

function daysOverdue(record){if(!record.expectedReturn)return 0;const expected=new Date(`${record.expectedReturn}T00:00:00`);const today=new Date();today.setHours(0,0,0,0);return Math.max(0,Math.floor((today-expected)/86400000))}
function phoneAnchor(phone,label){const digits=String(phone||'').replace(/\D/g,'');return digits.length>=8?`<a class="notification-contact ltr-number" href="tel:${esc(phone)}">☎ ${esc(label)} · ${esc(phone)}</a>`:''}
function leaveCard(){const active=leaveRecords.filter(r=>!r.returned);const overdue=active.filter(r=>daysOverdue(r)>0);return `<article class="info-card card"><h3>Children away from campus <span class="hindi-inline">باہر گئے بچے</span></h3><p>Expected return dates and family contact</p>${active.length?active.map(r=>`<div class="info-row"><span>${esc(r.student)} · Roll ${esc(r.roll||'—')}</span><b>${daysOverdue(r)?`Late ${daysOverdue(r)} day${daysOverdue(r)>1?'s':''}`:`Back ${esc(r.expectedReturn)}`}</b></div>`).join(''):'<div class="info-row"><span>No children currently away</span><b>✓</b></div>'}${overdue.length?`<div class="notification-entry overdue"><b>Return date passed</b><p>${overdue.length} child${overdue.length>1?'ren':''} need a follow-up. Tap Notifications to see saved phone numbers.</p><button class="button button-small button-quiet" data-action="show-notifications">Open notification</button></div>`:''}<button class="button button-small button-quiet" style="margin-top:9px" data-action="add-leave">＋ Record a leave</button></article>`}
function renderLeaveCard(){return leaveCard()}
function notificationMarkup(){const overdue=leaveRecords.filter(r=>!r.returned&&daysOverdue(r)>0);return `<div class="notification-head"><b>Notifications · ${overdue.length} late return${overdue.length===1?'':'s'}</b><button data-action="close-notifications" aria-label="Close notifications">×</button></div>${overdue.length?overdue.map(r=>{const staff=staffDirectory.find(s=>s.name===r.approvedBy);return `<div class="notification-entry overdue"><b>${esc(r.student)} · Roll ${esc(r.roll||'—')}</b><p>Expected back ${esc(r.expectedReturn)} · ${daysOverdue(r)} day${daysOverdue(r)>1?'s':''} overdue.<br>Approved by ${esc(r.approvedBy||'staff member')}${r.purpose?` · ${esc(r.purpose)}`:''}</p>${r.guardianPhone?phoneAnchor(r.guardianPhone,`${r.guardianName||'Family'} · call`):'<span class="not-set">Family phone is not saved on this demo leave record.</span>'}${staff?.phone?`<br>${phoneAnchor(staff.phone,`${staff.name} · call staff`)}`:''}</div>`}).join(''):'<div class="notification-entry"><b>No overdue leave today</b><p>When an expected return date passes, the warden and director can follow up here.</p></div>'}<div class="notification-entry"><button class="text-link" data-action="go-hostel">Open hostel leave register →</button></div>`}
function toggleNotifications(){const panel=document.getElementById('notificationPanel');if(panel.hidden){panel.innerHTML=notificationMarkup();panel.hidden=false}else panel.hidden=true}

const originalOpenModal=openModal;
openModal=function(kind,item=''){
  const key={'add-student':'student','add-leave':'leave','add-staff':'staff'}[kind];
  if(!key){originalOpenModal(kind,item);return}
  const config={student:{title:'Add a student',desc:'Keep the child and a parent or guardian together in the roll register.',fields:[['Student’s full name','text'],['Paper roll number','text'],['Class and section','text'],['Parent or guardian name','text'],['Parent or guardian phone','tel']]},leave:{title:'Add hostel leave / outing',desc:'Record who approved this leave and when the child is expected back.',fields:[['Student name or roll number','text'],['Parent / guardian name','text'],['Parent / guardian phone','tel'],['Expected return date','date'],['Approved by staff or director','select'],['Reason for leave','text']]},staff:{title:'Add a staff member',desc:'A staff phone number can be used for leave follow-up notifications.',fields:[['Staff member name','text'],['Phone number','tel'],['Role at the campus','text'],['Director? Enter Director in role if applicable','text']]}}[key];
  document.getElementById('modalTitle').textContent=config.title;document.getElementById('modalDescription').textContent=config.desc;document.getElementById('modalIcon').textContent=key==='leave'?'⌂':'＋';
  document.getElementById('modalFields').innerHTML=config.fields.map((field,i)=>{const id=`modalField${i}`;if(field[1]==='select')return `<div class="field"><label for="${id}">${field[0]}</label><select id="${id}">${staffDirectory.map(s=>`<option value="${esc(s.name)}">${esc(s.name)} · ${esc(s.role)}</option>`).join('')}</select></div>`;return `<div class="field"><label for="${id}">${field[0]}</label><input id="${id}" type="${field[1]}" placeholder="${field[1]==='date'?'Choose return date':field[0]}" ${i===0?'autofocus':''}></div>`}).join('');
  document.getElementById('modalBackdrop').hidden=false;document.getElementById('modalSave').dataset.kind=key;setTimeout(()=>document.getElementById('modalField0')?.focus(),80);
};

document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.id==='languageToggle'){
    event.preventDefault();event.stopImmediatePropagation();
    currentLanguage={en:'hi',hi:'ur',ur:'en'}[currentLanguage];
    document.documentElement.lang=currentLanguage;document.body.classList.toggle('lang-ur',currentLanguage==='ur');
    const labels=[['EN','en'],['हि','hi'],['اردو','ur']];target.innerHTML=labels.map(([label,lang])=>`<span class="${lang===currentLanguage?'lang-active':''}">${label}</span>`).join('');
    document.querySelector('.nav-label').innerHTML=currentLanguage==='ur'?'کام کی جگہ <span>مینو</span>':currentLanguage==='hi'?'काम की जगह <span>मेन्यू</span>':'WORKSPACE <span>काम</span>';
    render();showToast(currentLanguage==='ur'?'اردو منتخب ہے':currentLanguage==='hi'?'हिंदी चुनी गई':'English selected');return;
  }
  if(target.id==='notificationButton'){
    event.preventDefault();event.stopImmediatePropagation();toggleNotifications();return;
  }
  const action=target.dataset.action||'';
  if(action.startsWith('paper-')){
    event.preventDefault();event.stopImmediatePropagation();
    if(action==='paper-print'){window.print();return}
    if(action==='paper-add'){paperQuestions.push({text:'',marks:1});render();document.querySelector(`[data-question="${paperQuestions.length-1}"]`)?.focus();return}
    if(action==='paper-remove'){paperQuestions.splice(Number(target.dataset.index),1);render();return}
    if(action==='paper-reset'){paperQuestions=[{text:'',marks:1}];paperData={...paperData,exam:'New assessment'};render();return}
  }
  if(action==='show-notifications'){event.preventDefault();event.stopImmediatePropagation();toggleNotifications();return}
  if(action==='close-notifications'){document.getElementById('notificationPanel').hidden=true;return}
  if(action==='go-hostel'){document.getElementById('notificationPanel').hidden=true;return}
},true);

document.addEventListener('click',event=>{
  const save=event.target.closest('#modalSave');if(!save)return;
  const kind=save.dataset.kind;if(!['student','leave','staff'].includes(kind))return;
  event.preventDefault();event.stopImmediatePropagation();
  const field=id=>document.getElementById(`modalField${id}`)?.value.trim()||'';
  if(!field(0)){document.getElementById('modalField0')?.focus();showToast('Please enter the first detail');return}
  if(kind==='leave'&&!field(3)){document.getElementById('modalField3')?.focus();showToast('Please choose the expected return date');return}
  if(kind==='leave'&&!field(2)){document.getElementById('modalField2')?.focus();showToast('Please add a family phone number');return}
  if(kind==='student'){
    newRecords.push({roll:field(1)||String(13+newRecords.length).padStart(3,'0'),name:field(0),hindi:'',class:field(2)||'New admission',room:'Day scholar',gender:'Boy',status:'Present',time:'—',tone:'green',guardianName:field(3),guardianPhone:field(4)});
    closeModal();render();showToast('Student and guardian details saved in this demo');return;
  }
  if(kind==='leave'){
    const matching=[...students,...newRecords].find(s=>s.name.toLowerCase()===field(0).toLowerCase()||s.roll===field(0));
    const chosenStaff=staffDirectory.find(s=>s.name===document.getElementById('modalField4')?.value);
    leaveRecords.push({student:matching?.name||field(0),roll:matching?.roll||'',guardianName:field(1),guardianPhone:field(2),expectedReturn:field(3),approvedBy:chosenStaff?.name||field(4),staffPhone:chosenStaff?.phone||'',purpose:field(5),returned:false});
    closeModal();render();showToast('Leave recorded · return date reminders are active');return;
  }
  const staff={name:field(0),phone:field(1),role:field(2)||'Staff member',director:/director/i.test(field(3)+' '+field(2))};staffDirectory.push(staff);closeModal();render();showToast('Staff contact saved');
},true);

document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='paper-add'||action==='paper-remove'||action==='paper-print'||action==='paper-reset'||action==='show-notifications'||action==='close-notifications')return;
  if(event.target.closest('#notificationPanel')&&action==='go-hostel'){go('hostel');document.getElementById('notificationPanel').hidden=true;return}
  if(action==='go-hostel'&&currentPage==='home'){go('hostel');return}
});
document.addEventListener('click',event=>{if(!event.target.closest('#notificationPanel')&&!event.target.closest('#notificationButton'))document.getElementById('notificationPanel').hidden=true});

render();
