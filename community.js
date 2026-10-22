(() => {
  'use strict';
  const c = window.GARDEN_FIREBASE || {};
  const MAX_BYTES = 48 * 1024;
  let guest = null;
  let session = null, admin = false, candidate = null, previewURL = '', photoCursor = '', questionCursor = '';
  const imageCache = new Map();
  const $c = s => document.querySelector(s);
  const section = document.createElement('section');
  section.id = 'community'; section.className = 'community-section';
  section.innerHTML = `<div class="section-heading"><div><span class="eyebrow">PHOTOS & QUESTIONS</span><h2>사진과 Q&A</h2><p>사진으로 전하는 소식과 함께 나누는 질문.</p></div></div>
    <p id="community-status" class="community-status" role="status"></p>
    <details id="community-auth"><summary>관리자 로그인 · 회원가입</summary><p>답변 작성과 게시물 관리를 위한 관리자 로그인입니다. 사진과 질문은 로그인 없이 남길 수 있습니다.</p><form id="community-login"><label for="community-email">이메일</label><input id="community-email" type="email" autocomplete="username" required maxlength="254"><label for="community-password">비밀번호</label><input id="community-password" type="password" autocomplete="current-password" required minlength="8"><div class="community-toolbar"><button type="submit">로그인</button><button type="button" id="community-signup">회원가입 · 인증메일 보내기</button></div></form><button id="community-verify" hidden>인증메일 다시 보내기</button></details>
    <div class="community-toolbar"><span id="community-account"></span><button id="community-logout" hidden>로그아웃</button></div>
    <div class="community-columns"><div class="community-pane community-photo-pane"><div class="community-toolbar"><h3>사진</h3><button id="photos-load">새로 고침</button></div>
    <div id="photo-admin" class="community-compose"><h4>사진 올리기</h4><p>로그인 없이 사진을 올릴 수 있습니다. 게시된 사진은 공개됩니다. JPEG·PNG·WebP 파일을 선택하세요. 최대 960px, 48KB 이하로 압축하며 원본은 저장하지 않습니다.</p><input id="photo-file" aria-label="사진 파일" type="file" accept="image/jpeg,image/png,image/webp"><label for="photo-title">사진 설명</label><input id="photo-title" maxlength="120"><img id="photo-preview" class="community-preview" alt="압축 후 사진 미리보기" hidden><p id="photo-size" class="community-meta"></p><button id="photo-upload" class="primary" disabled>사진 게시</button></div>
    <div id="photo-list" class="community-grid"></div><button id="photos-more" class="community-more" hidden>이전 사진 더 보기</button>
    </div><div class="community-pane community-question-pane"><div class="community-toolbar"><h3>질문과 답변</h3><button id="questions-load">새로 고침</button></div><p class="community-meta">로그인 없이 이름과 질문만 입력하면 됩니다. 질문과 답변은 공개되므로 개인정보는 적지 마세요. 최근 20개씩 표시합니다.</p>
    <form id="question-form"><label for="question-name">표시 이름</label><input id="question-name" maxlength="30" required placeholder="닉네임"><label for="question-text">질문</label><textarea id="question-text" maxlength="2000" required placeholder="궁금한 내용을 남겨주세요"></textarea><button class="primary" type="submit">질문 등록</button></form><div id="question-list"></div><button id="questions-more" class="community-more" hidden>이전 질문 더 보기</button></div></div>`;
  const photoPane = section.querySelector('.community-photo-pane');
  photoPane.insertBefore(section.querySelector('#photo-list'), section.querySelector('#photo-admin'));
  photoPane.insertBefore(section.querySelector('#photos-more'), section.querySelector('#photo-admin'));
  const questionPane = section.querySelector('.community-question-pane');
  questionPane.insertBefore(section.querySelector('#question-list'), section.querySelector('#question-form'));
  questionPane.insertBefore(section.querySelector('#questions-more'), section.querySelector('#question-form'));
  document.querySelector('main').append(section);
  const nav = document.createElement('a'); nav.href = '#community'; nav.textContent = '사진·Q&A'; document.querySelector('header nav').append(nav);
  nav.addEventListener('click',()=>{location.hash='community'; section.scrollIntoView({block:'start'});});
  const status = text => {$c('#community-status').textContent=text;};
  function configured(){
    try {const u=new URL(c.databaseURL);return !!c.apiKey&&u.protocol==='https:'&&/\.(firebaseio\.com|firebasedatabase\.app)$/.test(u.hostname)&&u.pathname==='/';}catch{return false;}
  }
  async function identity(action, body){
    const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(c.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json(); if(!r.ok)throw Error(data.error?.message||'인증 요청 실패'); return data;
  }
  async function token(account=session){
    if(!account)throw Error('먼저 로그인해주세요.');
    if(Date.now()>account.expires){
      const r=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(c.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:account.refreshToken})});
      const data=await r.json();if(!r.ok){if(account===session){session=null;admin=false;}else{guest=null;sessionStorage.removeItem('garden-question-guest');}throw Error('로그인이 만료되었습니다. 다시 로그인해주세요.');}
      account.idToken=data.id_token;account.refreshToken=data.refresh_token;account.expires=Date.now()+(Number(data.expires_in)-60)*1000;
    }
    return account.idToken;
  }
  async function db(path, {method='GET',body,query={},authorized=false,authAccount=session}={}){
    if(!configured())throw Error('Firebase 연결 정보가 아직 설정되지 않았습니다.');
    const u=new URL('indicatorCommunity'+(path?'/'+path:'')+'.json',c.databaseURL);
    for(const [k,v] of Object.entries(query))u.searchParams.set(k,JSON.stringify(v));
    if(authorized)u.searchParams.set('auth',await token(authAccount));
    const r=await fetch(u,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});
    const data=await r.json();if(!r.ok)throw Error(r.status===401||r.status===403?'요청을 처리할 수 없습니다. 사진과 질문은 각각 1분 간격으로 등록해주세요. 관리자 작업은 권한이 필요합니다.':'저장·조회 실패. 연결을 확인하고 다시 시도해주세요.');return data;
  }
  async function busy(button, work){button.disabled=true;try{await work();}catch(e){const messages={INVALID_LOGIN_CREDENTIALS:'이메일 또는 비밀번호를 확인해주세요.',EMAIL_EXISTS:'이미 등록된 이메일입니다. 로그인해주세요.',TOO_MANY_ATTEMPTS_TRY_LATER:'요청이 많습니다. 잠시 뒤 다시 시도해주세요.'};status(messages[e.message]||e.message);}finally{button.disabled=button.id==='photo-upload'&&!candidate;if(button.textContent==='사진 다시 불러오기'&&button.isConnected)button.hidden=false;}}
  function account(){
    $c('#community-account').textContent=session?(admin?'관리자로 로그인됨':session.verified?'이메일 인증 완료':'이메일 인증 후 다시 로그인해주세요.'):'사진과 질문은 로그인 없이 올릴 수 있습니다.';
    $c('#community-logout').hidden=!session;$c('#community-verify').hidden=!session||session.verified;
    // Repaint only existing cards; do not download lists on every auth change.
    document.querySelectorAll('[data-admin-control]').forEach(el=>el.hidden=!admin);
  }
  $c('#community-login').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{
    if(!configured())throw Error('Firebase 연결 설정이 필요합니다.');
    const result=await identity('signInWithPassword',{email:$c('#community-email').value.trim(),password:$c('#community-password').value,returnSecureToken:true});
    $c('#community-password').value='';session={uid:result.localId,idToken:result.idToken,refreshToken:result.refreshToken,expires:Date.now()+3540000};admin=false;account();
    const user=(await identity('lookup',{idToken:session.idToken})).users[0];session.verified=!!user.emailVerified;
    admin=session.verified&&(await db('admins/'+session.uid,{authorized:true}))===true;account();status(admin?'사진 업로드와 답변을 작성할 수 있습니다.':session.verified?'로그인되었습니다.':'인증메일의 링크를 누른 뒤 다시 로그인해주세요.');
  });};
  $c('#community-signup').onclick=e=>busy(e.currentTarget,async()=>{
    if(!$c('#community-login').reportValidity())return;
    if(!configured())throw Error('Firebase 연결 설정이 필요합니다.');
    const result=await identity('signUp',{email:$c('#community-email').value.trim(),password:$c('#community-password').value,returnSecureToken:true});
    $c('#community-password').value='';await identity('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:result.idToken});status('인증메일을 보냈습니다. 인증 후 로그인해주세요.');
  });
  $c('#community-verify').onclick=e=>busy(e.currentTarget,async()=>{await identity('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:await token()});status('인증메일을 다시 보냈습니다.');});
  $c('#community-logout').onclick=()=>{session=null;admin=false;candidate=null;$c('#photo-file').value='';$c('#photo-upload').disabled=true;account();status('로그아웃했습니다.');};
  async function compress(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('10MB 이하 JPEG·PNG·WebP 사진을 선택해주세요.');
    const bitmap=await createImageBitmap(file);try{
      if(bitmap.width*bitmap.height>40000000)throw Error('사진의 가로·세로 크기가 너무 큽니다. 크기를 줄인 뒤 올려주세요.');
      let edge=960;
      while(edge>=160){
        const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        for(const quality of [.65,.5,.35,.2]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob&&blob.type==='image/webp'&&blob.size<=MAX_BYTES)return {blob,width:canvas.width,height:canvas.height};}
        edge=Math.floor(edge*.75);
      }
      throw Error('이 브라우저에서는 48KB 이하 WebP 압축을 완료하지 못했습니다. 다른 사진이나 최신 브라우저를 사용해주세요.');
    }finally{bitmap.close();}
  }
  let selection=0;
  $c('#photo-file').onchange=async e=>{const revision=++selection;candidate=null;$c('#photo-upload').disabled=true;$c('#photo-preview').hidden=true;const file=e.target.files[0];if(!file)return;status('사진을 압축하고 있습니다…');try{const result=await compress(file);if(revision!==selection)return;candidate=result;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(result.blob);$c('#photo-preview').src=previewURL;$c('#photo-preview').hidden=false;$c('#photo-size').textContent=`원본 ${(file.size/1024).toFixed(0)}KB → ${(result.blob.size/1024).toFixed(1)}KB · ${result.width}×${result.height}px · DB 저장 약 ${Math.ceil(result.blob.size/3)*4/1024|0}KB`;$c('#photo-upload').disabled=false;status('압축된 사진을 확인한 뒤 게시해주세요.');}catch(err){status(err.message);}};
  const key=()=>Date.now().toString()+'_'+crypto.randomUUID();
  const toDataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  $c('#photo-upload').onclick=e=>busy(e.currentTarget,async()=>{
    if(!candidate)throw Error('사진을 선택해주세요.');
    const title=$c('#photo-title').value.trim();if(!title)throw Error('사진 설명을 입력해주세요.');
    const photo=candidate,writer=await questionIdentity();
    const id=key(),dataUrl=await toDataURL(photo.blob);
    await db('',{method:'PATCH',authorized:true,authAccount:writer,body:{['photos/'+id]:{title,authorUid:writer.uid,createdAt:{'.sv':'timestamp'},width:photo.width,height:photo.height,bytes:photo.blob.size},['photoBodies/'+id]:dataUrl,['photoPosting/'+writer.uid]:{at:{'.sv':'timestamp'},id}}});
    candidate=null;$c('#photo-file').value='';$c('#photo-preview').hidden=true;status('사진을 게시했습니다.');await photos(false);
  });
  function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function button(text,action,adminOnly=false){const b=node('button',text);b.type='button';b.onclick=()=>busy(b,action);if(adminOnly){b.dataset.adminControl='';b.hidden=!admin;}return b;}
  async function list(path,cursor,count){const query={orderBy:'$key',limitToLast:count+(cursor?2:1)};if(cursor)query.endAt=cursor;const result=await db(path,{query});return Object.entries(result||{}).filter(([id])=>!cursor||id<cursor).sort(([a],[b])=>b.localeCompare(a));}
  async function photos(more){const rows=await list('photos',more?photoCursor:'',6);const visible=rows.slice(0,6);if(!more)$c('#photo-list').replaceChildren();for(const [id,p] of visible){const card=node('article',undefined,'community-card');card.append(node('h3',p.title),node('p',new Date(p.createdAt).toLocaleDateString('ko-KR'),'community-meta'));const open=button('사진 다시 불러오기',async()=>{let value=imageCache.get(id);if(!value){value=await db('photoBodies/'+id);if(typeof value!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value)||value.length>65600)throw Error('사진 데이터가 없거나 형식이 올바르지 않습니다.');imageCache.set(id,value);}const img=node('img');img.alt=p.title;img.src=value;card.prepend(img);open.remove();});card.append(open,button('사진 삭제',async()=>{if(!confirm('이 사진을 삭제할까요?'))return;await db('',{method:'PATCH',authorized:true,body:{['photos/'+id]:null,['photoBodies/'+id]:null}});imageCache.delete(id);card.remove();status('사진을 삭제했습니다.');},true));$c('#photo-list').append(card);open.hidden=true;open.click();}if(visible.length)photoCursor=visible.at(-1)[0];$c('#photos-more').hidden=rows.length<=6;if(!more&&!rows.length)$c('#photo-list').append(node('p','아직 게시된 사진이 없습니다.'));}
  async function questions(more){const rows=await list('questions',more?questionCursor:'',20),visible=rows.slice(0,20);if(!more)$c('#question-list').replaceChildren();for(const [id,q] of visible){const card=node('article',undefined,'community-card');card.append(node('p',q.name+' · '+new Date(q.createdAt).toLocaleDateString('ko-KR'),'community-meta'),node('p',q.question));if(q.answer)card.append(node('p','관리자 답변\n'+q.answer,'community-answer'));else card.append(node('p','답변을 기다리고 있습니다.','community-meta'));const form=node('div');form.dataset.adminControl='';form.hidden=!admin;const answer=node('textarea');answer.maxLength=3000;answer.value=q.answer||'';answer.setAttribute('aria-label','관리자 답변');form.append(answer,button('답변 저장',async()=>{if(!answer.value.trim())throw Error('답변을 입력해주세요.');await db('questions/'+id,{method:'PATCH',authorized:true,body:{answer:answer.value.trim(),answeredAt:{'.sv':'timestamp'}}});status('답변을 저장했습니다.');await questions(false);}),button('질문 삭제',async()=>{if(!confirm('질문과 답변을 삭제할까요?'))return;await db('questions/'+id,{method:'DELETE',authorized:true});card.remove();status('질문을 삭제했습니다.');}));card.append(form);$c('#question-list').append(card);}if(visible.length)questionCursor=visible.at(-1)[0];$c('#questions-more').hidden=rows.length<=20;if(!more&&!rows.length)$c('#question-list').append(node('p','첫 질문을 남겨주세요.'));}
  async function questionIdentity(){
    if(session)return session;
    if(!guest){try{guest=JSON.parse(sessionStorage.getItem('garden-question-guest')||'null');}catch{guest=null;}}
    if(guest){try{await token(guest);}catch{guest=null;}}
    if(!guest){const result=await identity('signUp',{returnSecureToken:true});guest={uid:result.localId,idToken:result.idToken,refreshToken:result.refreshToken,expires:Date.now()+3540000};}
    try{sessionStorage.setItem('garden-question-guest',JSON.stringify(guest));}catch{}
    return guest;
  }
  $c('#question-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const name=$c('#question-name').value.trim(),question=$c('#question-text').value.trim();if(!name||!question)throw Error('이름과 질문을 입력해주세요.');const writer=await questionIdentity();const id=key();await db('',{method:'PATCH',authorized:true,authAccount:writer,body:{['questions/'+id]:{name,question,authorUid:writer.uid,createdAt:{'.sv':'timestamp'}},['posting/'+writer.uid]:{at:{'.sv':'timestamp'},id}}});$c('#question-text').value='';status('질문을 등록했습니다. 다음 질문은 1분 뒤에 등록할 수 있습니다.');await questions(false);});};
  $c('#photos-load').onclick=e=>busy(e.currentTarget,()=>photos(false));$c('#photos-more').onclick=e=>busy(e.currentTarget,()=>photos(true));$c('#questions-load').onclick=e=>busy(e.currentTarget,()=>questions(false));$c('#questions-more').onclick=e=>busy(e.currentTarget,()=>questions(true));
  if(!configured()){status('사진·Q&A 연결 준비 중입니다. Firebase 웹 앱 설정과 데이터베이스 규칙을 적용하면 사용할 수 있습니다.');section.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);}else {status('사진과 질문을 자유롭게 남겨주세요.');let loaded=false;const loadInitial=()=>{if(loaded)return;loaded=true;busy($c('#photos-load'),()=>photos(false));busy($c('#questions-load'),()=>questions(false));};const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){loadInitial();observer.disconnect();}},{rootMargin:'120px'});observer.observe(section);if(location.hash==='#community')loadInitial();window.addEventListener('hashchange',()=>{if(location.hash==='#community')loadInitial();});}
  account();
})();
