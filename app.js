'use strict';
const $=id=>document.getElementById(id);
const full='只测温显示，不控制加热或制冷，USB-C 5V供电，测量-10到50℃，精度±0.5℃，用BME280和ESP32-S3，OLED显示';
let pending=null,busy=false;
const roles={sensor:'传感器资料',connector:'连接器资料',power:'电源器件资料',controller:'控制器资料',reference_context:'参考开发板 · 仅作背景',display:'显示器资料',network:'网络能力'};
const fields={model:'型号',temperature_range:'温度范围',accuracy:'测量精度',supply:'供电',specification:'整体适配'};
const states={MATCH:'字段符合',NOT_MET:'不满足',UNKNOWN:'尚未确认',FIELD_MATCH_ONLY:'仅字段命中'};
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function setStep(index){[...$('steps').children].forEach((e,i)=>{e.classList.toggle('current',i===index);if(i===index)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});}
function error(message){$('error').textContent=message;$('error').hidden=!message;}
function reset(){pending=null;$('clarification').hidden=true;$('answers').value='';$('results').hidden=true;$('candidate-list').replaceChildren();$('raw-result').textContent='';$('empty-state').hidden=false;$('submit-label').textContent='分析这句话';$('status').textContent='输入后，点击按钮开始。';error('');setStep(0);}
function sourceLink(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return null;const a=node('a','查看来源原文 ↗');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}}
function showCandidates(envelope){
 const r=envelope.result;$('results').hidden=false;$('empty-state').hidden=true;$('candidate-list').replaceChildren();
 $('result-summary').textContent=`实际找到 ${r.matches.length} 条相关资料。这些只是待核查候选，不代表满足要求或可以直接复用。`;
 for(const m of r.matches){
  const card=node('article',undefined,'card candidate-card'),top=node('div',undefined,'candidate-top'),title=node('div');title.append(node('p',roles[m.role]||m.role,'role'),node('h3',m.name));top.append(title,node('span',m.assessment==='UNKNOWN'?'尚未确认 · UNKNOWN':(states[m.assessment]||m.assessment),'badge'));card.append(top);
  card.append(node('p',m.assessment==='NOT_MET'?'已登记字段存在不满足项，请勿据此选型。':'资料找到了，但适配性还需要进一步核查。','assessment'));
  const list=node('ul');for(const c of m.constraints)list.append(node('li',`${fields[c.field]||c.field}：${states[c.status]||c.status}。${c.reason}`));card.append(list);
  const source=node('div',undefined,'candidate-source'),a=sourceLink(m.source_url);source.append(a||node('span','来源链接尚未登记'));source.append(node('p',`来源版本：${m.source_revision||'未登记'} · 许可：${m.license||'未确认'} · 可复用标记：${m.reusable?'是（仍需人工审核）':'否'}`));card.append(source);
  const details=node('details'),summary=node('summary','查看这条资料的限制');details.append(summary);const limits=node('ul');for(const line of m.limitations||[])limits.append(node('li',line));details.append(limits,node('p','记录ID：'+m.id));card.append(details);$('candidate-list').append(card);
 }
 const gaps=$('gaps');gaps.replaceChildren();for(const m of r.missing||[])gaps.append(node('li',`${roles[m.role]||m.role}：${m.reason}`));
 if(!(r.missing||[]).length)gaps.append(node('li','未发现空缺类别，不等于参数齐全或电气验证通过；请逐条检查UNKNOWN。'));
 if(r.unsupported_sensor)gaps.append(node('li','指定传感器未在当前索引找到；没有替换为其他型号。'));
 gaps.append(node('li','尚未验证真实硬件、测量准确性、完整电源路径、PCB及生产可行性。'));
 $('raw-result').textContent=JSON.stringify(envelope,null,2);setStep(2);$('status').textContent='快照筛选已完成，结果仅供核查。';$('submit-label').textContent='重新分析';$('results').focus();
}
function showClarification(envelope,submitted){
 const r=envelope.result,rewrite=r.parsed.questions.some(q=>q.field==='interpretation');pending={text:submitted.text,answers:submitted.answers||'',rewrite};
 $('questions').replaceChildren(...r.parsed.questions.map(q=>node('li',q.question)));$('clarification').hidden=false;$('results').hidden=true;$('empty-state').hidden=true;
 $('answer-label').textContent=rewrite?'请重新写下最终明确需求（替换本次原话）':'用自己的话补充这些条件';
 $('answer-help').textContent=rewrite?'本版不能自动理解排除或替换关系。请填写一份不含这类歧义的最终需求，下次只分析这份新文字。':'例如：只测温显示，USB-C 5V，-10到50℃，误差±0.5℃，用BME280和ESP32-S3，OLED显示。未指定的型号不会自动补齐。';
 $('answers').value=submitted.answers||'';$('submit-label').textContent=rewrite?'用最终需求重新分析':'补充后查资料';$('status').textContent='还没有执行候选查询，请先补充。';setStep(1);$('answers').focus();
}
async function requestJSON(url,options){await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));const s=globalThis.THERM_SNAPSHOT;if(!s)throw Error('资料快照没有加载，请重新打开页面。');if(url==='/api/info')return {web_version:'browser-snapshot-0.1',core_parser:'bounded-rules-0.3',snapshot_version:s.version,database:{records:s.records.length,records_sha256:s.records_sha256},mode:'浏览器公开元数据快照，不是实时SQLite'};if(url!=='/api/evaluate')throw Error('不支持的本地计算');const v=JSON.parse(options.body);return {mode:'browser-only-no-upload',evaluated_at:new Date().toISOString(),result:ThermEngine.evaluateSnapshot(v.text+(v.answers?'\n客户补充：'+v.answers:''),s)};}
$('request').addEventListener('input',()=>{if(!busy)reset();});
for(const [id,text] of [['example-simple','我想做一个温控计'],['example-full',full]])$(id).addEventListener('click',()=>{$('request').value=text;reset();$('request').focus();});
$('request-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;error('');const original=$('request').value.trim(),answer=$('answers').value.trim();
 if(!original){error('先写一句你的想法，再开始分析。');$('request').focus();return;}
 if(pending&&!answer){error(pending.rewrite?'请先填写最终明确需求。':'请先补充上面的问题。');$('answers').focus();return;}
 const payload=pending?(pending.rewrite?{text:answer}:{text:pending.text,answers:answer}):{text:original};
 busy=true;for(const e of document.querySelectorAll('button,textarea'))e.disabled=true;$('request-form').setAttribute('aria-busy','true');$('submit-label').textContent='正在分析…';$('status').textContent='正在调用浏览器解析与资料快照筛选，请稍候。';$('results').hidden=true;
 try{const result=await requestJSON('/api/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(result.result.status==='NEEDS_CLARIFICATION')showClarification(result,payload);else{pending=null;$('request').value=payload.text+(payload.answers?'\n客户补充：'+payload.answers:'');$('clarification').hidden=true;showCandidates(result);}}
 catch(e){error(e.name==='AbortError'?'等待超时，请确认静态页面文件仍在运行。':e.message||'连接失败，请确认静态页面文件仍在运行。');$('submit-label').textContent=pending?(pending.rewrite?'用最终需求重新分析':'补充后查资料'):'再次分析';$('status').textContent='本次未获得可用结果，输入内容已保留。';}
 finally{busy=false;for(const e of document.querySelectorAll('button,textarea'))e.disabled=false;$('request-form').removeAttribute('aria-busy');if(!$('clarification').hidden)$('answers').focus();}
});
requestJSON('/api/info').then(v=>{$('db-count').textContent=`资料快照 · ${v.database.records} 条资料`;$('db-description').textContent='公开元数据快照20261101-r1，不是实时SQLite。';$('service-info').textContent=JSON.stringify(v,null,2);}).catch(()=>{$('db-count').textContent='资料快照未加载';$('db-description').textContent='请检查静态页面文件，输入不会被当作查询成功。';$('service-info').textContent='无法读取服务信息。';});
