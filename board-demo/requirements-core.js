(function(root){'use strict';
const VERSION='workflow-public-r2',clone=x=>JSON.parse(JSON.stringify(x));
const defaults={idea:'',place:'',purpose:'',measure:'',power:'',output:'',route:'',quantity:'',lo:'',hi:'',error:'',bareVdd:false,vdd:'',confirmed:false};
const labels={place:{room:'放在室内',portable:'随身携带',undecided:'使用地点还没定'},purpose:{observe:'记录和查看',control:'控制其他设备',undecided:'用途还没定'},measure:{temperature:'温度',temperature_humidity:'温度和湿度'},power:{usb5:'USB-C 5V外部供电',battery:'电池',other:'其他供电',undecided:'供电还没定'},output:{serial:'在电脑串口查看',screen:'在小屏幕查看',network:'联网查看',undecided:'查看方式还没定'},route:{s3_bme:'ESP32-S3＋BME280裸芯片资料演示候选',other:'其他器件路线',undecided:'器件路线还没定'},quantity:{internal_sensor_temperature:'芯片测到的温度',ambient_temperature:'周围空气的温度'}};
function normaliseTemperatureUnits(text){
return String(text).normalize('NFKC').replace(/[−﹣]/g,'-').replace(/(-?\d+(?:\.\d+)?)\s*(?:°\s*C|摄氏度|攝氏度|℃|度)/gi,(_,n)=>n+'℃');
}
function recogniseOriginal(text){
const normalised=normaliseTemperatureUnits(text),facts=[];
const add=(field,value,match)=>{const nums=Array.isArray(value)?value:[value];facts.push({field,value,matched_text:match,source:'EXPLICIT_ORIGINAL_TEXT_BOUNDED_PATTERN',...(nums.some(x=>typeof x==='number'&&!Number.isFinite(x))?{parse_error:'NON_FINITE_NUMBER'}:{})});};
for(const m of normalised.matchAll(/(-?\d+(?:\.\d+)?)\s*℃?\s*(?:到|至|~|～|—|–|-)\s*(-?\d+(?:\.\d+)?)\s*℃/g))add('temperature_range_c',[Number(m[1]),Number(m[2])],m[0]);
for(const m of normalised.matchAll(/(?:单点|只测|仅测量|固定在)\s*(-?\d+(?:\.\d+)?)\s*℃/g))add('temperature_range_c',[Number(m[1]),Number(m[1])],m[0]);
for(const m of normalised.matchAll(/(-?\d+(?:\.\d+)?)\s*℃\s*单点/g))add('temperature_range_c',[Number(m[1]),Number(m[1])],m[0]);
for(const m of normalised.matchAll(/(?:允许(?:的)?(?:温度)?误差|(?:温度)?误差|(?:温度)?精度|(?:温度)?准确度|读数相差|偏差)\s*(?:要求|目标)?\s*(?:为|是|:|≤|不超过|不得超过|小于等于|以内|在|允许)?\s*(?:±|\+\s*\/\s*-|[+-])?\s*(\d+(?:\.\d+)?)\s*℃/g))add('allowed_error_c',Number(m[1]),m[0]);
for(const m of normalised.matchAll(/(?:±|\+\s*\/\s*-)\s*(\d+(?:\.\d+)?)\s*℃/g))add('allowed_error_c',Number(m[1]),m[0]);
for(const m of normalised.matchAll(/(?:允许(?:的)?(?:温度)?误差|(?:温度)?误差|(?:温度)?精度|(?:温度)?准确度|读数相差|偏差)\s*(?:要求|目标)?\s*(?:为|是|:|≤|不超过|不得超过|小于等于|以内|在|允许)?\s*(?:±|\+\s*\/\s*-|[+-])?\s*(\d+(?:\.\d+)?)/g)){const suffix=normalised.slice(m.index+m[0].length).trimStart();if(!suffix.startsWith('℃'))add('unresolved_error_unit',{number:Number(m[1]),following_text:suffix.slice(0,12)},m[0]);}
const direct=/VDD\s*(?:直接接|直供|连接|接|为|是|用|=|:)?\s*(-?\d+(?:\.\d+)?)\s*V\b/gi;
for(const m of normalised.matchAll(direct))add('direct_bare_vdd_v',Number(m[1]),m[0]);
const withoutDirect=normalised.replace(direct,'VDD节点');
for(const m of withoutDirect.matchAll(/(-?\d+(?:\.\d+)?)\s*V\b/gi))add('remaining_voltage_v',Number(m[1]),m[0]);
if(/串口|\bUART\b|\bSERIAL\b/i.test(normalised))add('output','serial','串口/UART/SERIAL');
if(/屏幕|小屏|显示屏|OLED|LCD/i.test(normalised))add('output','screen','屏幕/OLED/LCD');
if(/联网|蓝牙|Wi-?Fi/i.test(normalised))add('output','network','联网/蓝牙/WiFi');
if(/环境温度|空气(?:的)?温度/.test(normalised))add('quantity','ambient_temperature','环境/空气温度');
if(/芯片(?:内部)?(?:的)?温度|内部温度/.test(normalised))add('quantity','internal_sensor_temperature','芯片/内部温度');
return {original_text:text,normalised_text:normalised,unit_normalisation:'Numeric temperature units 度/℃/°C/摄氏度 -> ℃ before token scan and comparisons; no Fahrenheit conversion',facts};
}
function analyse(input){const d={...defaults,...clone(input)},issues=[],add=(field,message,kind='QUESTION')=>issues.push({field,message,kind});
if(!d.idea.trim())add('idea','先写一句你想做什么。');else if(d.idea.length>2000)add('idea','请把想法控制在2000字以内。');
if(/控制|加热|制冷|继电器|温控器|风扇|蜂鸣器|报警|防爆|医疗|安全联锁/.test(d.idea)||d.purpose==='control')add('purpose','原话或选择涉及控制/安全用途；本页只做采集资料审核，暂不支持该方案，也不把它改成普通温度计。','OUT_OF_SCOPE');
if(/电池|太阳能|市电|220\s*[vV]/.test(d.idea)||['battery','other'].includes(d.power))add('power','你提到的供电不在当前USB-C 5V演示范围内。没有替换成默认电源。','OUT_OF_SCOPE');
if(/ESP32[- _]?C3|\bC3\b|DHT\d*|BMP280|DS18B20|STM32/i.test(d.idea)||d.route==='other')add('route','这条器件路线暂未接入。不会自动把C3、DHT或其他型号换成S3和BME280。','OUT_OF_SCOPE');
if(/不用|不要|不使用|不采用|替换|改用|排除|除非/.test(d.idea))add('idea','原话有排除或替换条件，本页不能可靠解释；请用明确的最终目标重新描述，不能靠后面的选项悄悄覆盖。');
if(d.purpose!=='observe'&&!issues.some(x=>x.field==='purpose'))add('purpose','是只记录和查看，还是还需要控制设备？');
if(!['temperature','temperature_humidity'].includes(d.measure))add('measure','你想看温度，还是温度和湿度？');
if(d.power!=='usb5'&&!issues.some(x=>x.field==='power'))add('power','请明确供电方式；“便携”不等于“电池”，本版不替你猜电压。');
if(d.route!=='s3_bme'&&!issues.some(x=>x.field==='route'))add('route','要不要用明确标注的S3＋BME280资料演示路线做对照？这不是选型批准。');
if(!['serial','screen'].includes(d.output))add('output',d.output==='network'?'联网适配尚未支持，不能拿串口输出冒充联网。':'你想在哪里看到读数？',d.output==='network'?'OUT_OF_SCOPE':'QUESTION');
if(!['internal_sensor_temperature','ambient_temperature'].includes(d.quantity))add('quantity','请选择芯片温度或周围空气温度，两者不能默认为一样。');
const n=v=>String(v).trim()===''?null:Number(v),lo=n(d.lo),hi=n(d.hi),error=n(d.error),vdd=n(d.vdd);
const original=recogniseOriginal(d.idea),raw=original.normalised_text,lexical=raw.replace(/VDD\s*(?:直接接|直供|连接|接|为|是|用|=|:)?\s*(-?\d+(?:\.\d+)?)\s*V\b/gi,'VDD').replace(/℃/g,' '),tokens=lexical.match(/[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*(?:\.[A-Za-z0-9]+)*/g)||[],allowed=new Set(['ESP32-S3','ESP32S3','S3','BME280','USB-C','TYPE-C','V','VDD','OLED','LCD','I2C','IIC','UART','SERIAL']);const unknown=tokens.filter(x=>!allowed.has(x.toUpperCase()));if(unknown.length&&!issues.some(x=>x.field==='route'))add('route','原话中的型号或词语角色尚未确认：'+[...new Set(unknown)].join('、')+'。不会用演示器件覆盖它们。');
if(/水温|液体|人体|体温|土壤/.test(raw))add('quantity','这类测量对象尚未接入本页，不能用芯片或周围空气的温度替代。','OUT_OF_SCOPE');
if(/湿度|温湿/.test(raw)&&d.measure==='temperature')add('measure','原话提到湿度，但选项只留下温度；请重新确认最终目标，不静默删掉要求。');
const values=field=>[...new Map(original.facts.filter(x=>x.field===field).map(x=>[JSON.stringify(x.value),x.value])).values()];
function compareOriginal(field,actual,id,title,unit=''){const vs=values(field);if(vs.length>1){add(id,'原话里有多个不同的'+title+'，本版不能任选一项；请统一成最终要求。');return;}if(vs.length===1&&actual!==null&&JSON.stringify(vs[0])!==JSON.stringify(actual))add(id,'原话'+title+'为'+JSON.stringify(vs[0])+unit+'，表单为'+JSON.stringify(actual)+unit+'，不一致。请统一原话与表单；普通确认不会覆盖或放宽原话要求。');}
compareOriginal('temperature_range_c',lo!==null&&hi!==null&&Number.isFinite(lo)&&Number.isFinite(hi)?[lo,hi]:null,'lo','温区','℃');
compareOriginal('allowed_error_c',Number.isFinite(error)&&error>0?error:null,'error','误差目标','℃');
if(values('unresolved_error_unit').length)add('error','原话的误差数值没有明确可支持的℃单位，不能用表单温度误差覆盖；请写清最终误差与单位。');
if(!values('allowed_error_c').length&&/(?:误差|精度|准确度|读数相差|偏差)[^。；;\n]{0,40}?\d+(?:\.\d+)?\s*℃/.test(raw))add('error','原话包含本版未能明确理解的误差表达，请重述为“允许误差±数值℃”，不能直接用表单覆盖。');
compareOriginal('output',d.output||null,'output','查看方式');
compareOriginal('quantity',d.quantity||null,'quantity','测量对象');
const directValues=values('direct_bare_vdd_v');if(directValues.length&&!d.bareVdd)add('vdd','原话明确写了VDD直供电压，请在芯片供电项确认同一节点和数值；不能省略。');else compareOriginal('direct_bare_vdd_v',Number.isFinite(vdd)?vdd:null,'vdd','裸芯片VDD电压','V');
if(values('remaining_voltage_v').some(v=>v!==5))add('power','原话中未归入VDD的电压与USB-C 5V演示供电不一致；请区分节点并统一最终要求，不能按默认5V覆盖。');
for(const f of original.facts)if(f.parse_error)add(f.field==='allowed_error_c'?'error':f.field==='temperature_range_c'?'lo':'power','原话存在超出可处理范围的数值，请改写为有效目标。');
if(lo===null||hi===null||!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)add('lo','请给出最低和最高温度；不知道可以先保留待追问，不会自动填一个温区。');
if(error===null||!Number.isFinite(error)||error<=0)add('error','你能接受读数相差多少℃？不知道就先留空，不默认±0.5℃。');
if(d.bareVdd&&(vdd===null||!Number.isFinite(vdd)||vdd<=0))add('vdd','请填明确的BME280裸芯片VDD直供电压；它不是系统输入电压。');
if(!d.bareVdd&&vdd!==null)add('vdd','这个电压尚未确认是裸芯片VDD节点，请确认或留空；不能拿系统5V代入。');
if(!d.confirmed)add('confirmed','请确认这些选项确实是你的意思；演示路线不是已经批准的器件方案。');
const facts=Object.keys(labels).map(field=>({field,value:d[field]||null,label:labels[field][d[field]]||'尚未确认',source:'EXPLICIT_USER_FORM',not_inferred_from_idea:true}));
facts.push({field:'temperature_range_c',value:lo!==null&&hi!==null?[lo,hi]:null,source:'EXPLICIT_USER_FORM'},{field:'allowed_error_c',value:error,source:'EXPLICIT_USER_FORM'},{field:'direct_bare_vdd_v',value:d.bareVdd?vdd:null,source:'EXPLICIT_USER_FORM',node:d.bareVdd?'BME280 bare IC VDD':null});
let canonical=null;if(!issues.length)canonical=`仅${d.measure==='temperature_humidity'?'采集温湿度':'测温'}，USB-C 5V系统输入，ESP32-S3、BME280，测量${lo}到${hi}℃，允许误差±${error}℃，${d.output==='serial'?'串口输出':'屏幕显示'}。`+(d.bareVdd?`BME280裸芯片VDD直接接${vdd}V。`:'');
return {draft:d,issues,facts,recognised_original:original,scope:issues.some(x=>x.kind==='OUT_OF_SCOPE')?'OUT_OF_SCOPE':issues.length?'NEEDS_CLARIFICATION':'READY_FOR_LIMITED_REVIEW',canonical_for_explicit_demo:canonical,condition_request:canonical?{object:'BME280 bare IC',quantity:d.quantity,temperature_range_c:[lo,hi],allowed_error_c:error,unit:'degC'}:null,limits:['原话中的已识别温区、误差、输出、测量对象和节点电压必须与表单一致；复杂表述仍无通用自然语言理解。','器件型号来自用户明确选择的资料演示路线，不是系统推断或已批准选型。',...(d.measure==='temperature_humidity'?['温湿度目标已保存；现有规则只核对温度相关资料，湿度功能与采集参数没有因此通过。']:[])]};}
async function hash(x){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function createStore(id){let revision=0,draft={...defaults},analysis=analyse(draft),run=null,selected=[],execution={status:'DRAFT'},runTicket=0;
function edit(next){const value={...defaults,...clone(next)};if(JSON.stringify(value)!==JSON.stringify(draft)){draft=value;revision++;runTicket++;analysis=analyse(draft);run=null;selected=[];execution={status:'DRAFT'};}return snapshot();}
function snapshot(){return {project_id:id,workflow_version:VERSION,requirement_revision:revision,draft:clone(draft),analysis:clone(analysis),review:clone(run),candidate_choices:clone(selected),execution:clone(execution),stages_not_supported:['firmware_generation','simulation','board_generation','manufacturing'],design_approved:false,input_uploaded:false,auto_saved:false};}
async function review(deps){const at=revision,ticket=++runTicket,a=analyse(draft);analysis=a;run=null;selected=[];if(a.issues.length){execution={status:a.scope};return {discarded:false,record:snapshot()};}execution={status:'RUNNING'};const binding={project_id:id,requirement_revision:at,original_idea:draft.idea,recognised_original:a.recognised_original,explicit_facts:a.facts,confirmed:draft.confirmed,canonical_for_explicit_demo:a.canonical_for_explicit_demo,condition_request:a.condition_request};
try{const digest=await hash(binding),audit=await deps.audit(a.canonical_for_explicit_demo),condition=await deps.condition(a.condition_request);if(at!==revision||ticket!==runTicket)return {discarded:true,record:snapshot()};run={binding:{project_id:id,requirement_revision:at,requirements_sha256:digest,hash_input:'JSON.stringify(binding_payload) in exported original key order'},binding_payload:binding,audit,condition,source_bundle:{audit:'public-metadata-20261101-r1 fixed9',condition:'BME280-conditional-public-r2-20261101-r1',audit_binding:audit.baseline,condition_binding:condition.baseline,scope:'Separate fixed public baselines; not live library or13-source SQL query'},completed_at:new Date().toISOString(),engineering_approved:false};execution={status:'COMPLETED'};return {discarded:false,record:snapshot()};}catch(e){if(at!==revision||ticket!==runTicket)return {discarded:true,record:snapshot()};run=null;selected=[];execution={status:'ERROR',message:e.message};return {discarded:false,record:snapshot()};}}
function toggle(id){if(!run||run.binding.requirement_revision!==revision)throw Error('没有本版有效候选');if(!run.audit.candidates.some(c=>c.id===id))throw Error('候选不在本次结果中');const pos=selected.findIndex(x=>x.record_id===id);if(pos>=0)selected.splice(pos,1);else selected.push({record_id:id,decision:'TO_REVIEW_NOT_APPROVED',project_id:run.binding.project_id,requirement_revision:revision,requirements_sha256:run.binding.requirements_sha256});return snapshot();}
function exportRecord(){const out=snapshot();out.exported_at=new Date().toISOString();out.requirements_sha256=run?.binding.requirements_sha256||null;return out;}
return {edit,review,snapshot,toggle,exportRecord};}
root.WorkflowCore={VERSION,defaults,labels,normaliseTemperatureUnits,recogniseOriginal,analyse,createStore};if(typeof module!=='undefined'&&module.exports)module.exports=root.WorkflowCore;
})(globalThis);
