// MIT. Derived bounded audit, browser snapshot only; see LICENSE/THIRD_PARTY_NOTICES.md.
(function(root){'use strict';const core=root.ThermEngine;
function facts(text){
 const requirement_facts=[],exclusions=[],direct=[];let normalized=text.normalize('NFKC'),explicitBare=false;
 normalized=normalized.replace(/(?:不用|不使用|不要用|不采用)\s*(BME280|USB-C|ESP32-S3|AP2112K-3\.3TRG1)(?![A-Za-z0-9_-])/gi,(raw,model)=>{model=model.toUpperCase();exclusions.push(model);requirement_facts.push({raw,polarity:'NEGATIVE',object:model,kind:'EXCLUSION'});return '';});
 // Only this explicit, bounded replacement has an assigned sensor role.
 normalized=normalized.replace(/改用\s*([A-Za-z][A-Za-z0-9_-]*)\s*传感器(?![A-Za-z0-9_-])/gi,(raw,model)=>{requirement_facts.push({raw,polarity:'POSITIVE',object:model.toUpperCase(),kind:'SENSOR_MODEL'});return '传感器用'+model;});
 normalized=normalized.replace(/改用电池供电/g,raw=>{requirement_facts.push({raw,polarity:'POSITIVE',object:'battery',kind:'SYSTEM_SUPPLY',value:null,unit:'V'});return '电池供电';});
 normalized=normalized.replace(/BME280(?:裸芯片)?\s*VDD(?!IO)[^，,。；;\n]*/gi,raw=>{const volts=[...raw.matchAll(/(?:直接接|直接连接|直连)\s*(\d+(?:\.\d+)?)\s*V\b/gi)].map(m=>Number(m[1]));if(!volts.length)return raw;direct.push(...volts);explicitBare=explicitBare||raw.includes('裸芯片');requirement_facts.push({raw,polarity:'POSITIVE',object:raw.includes('裸芯片')?'BME280 bare IC':'BME280 unspecified form',node:'VDD',values:volts,unit:'V',kind:'DIRECT_PIN_SUPPLY'});return 'BME280';});
 const parsed=core.parseRequirement(normalized);requirement_facts.push({raw:text,polarity:'UNKNOWN',kind:'BOUNDED_PARSER_DERIVATION',normalized_for_core:normalized,recognized:parsed.recognized,note:'仅上述明确排除/传感器替换/VDD短句由本适配层解释；其余交原0.3，非通用否定解析'});
 return {requirement_facts,exclusions,direct,explicitBare,parsed};
}
function reviewWithSnapshot({text},snapshot,recordHashes){
 if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('text必须为1—8000字符需求');
 const f=facts(text),positive=f.parsed.recognized,exclusionConflict=f.exclusions.some(e=>e===positive.sensor||e===positive.controller||e==='USB-C'&&positive.power?.connector==='USB-C'),conflicting=exclusionConflict||new Set(f.direct).size>1||f.parsed.conflicts.some(x=>['MULTIPLE_SUPPLY_VOLTAGES','SENSOR_CONFLICT','CONTROLLER_CONFLICT','RANGE_CONFLICT'].includes(x));
 const scope=f.parsed.recognized.purpose==='control_or_conflict'?'OUT_OF_SCOPE':f.parsed.questions.some(q=>q.field==='interpretation'||q.field==='purpose')?'NEEDS_CLARIFICATION':'IN_SCOPE';
 const questions=[...f.parsed.questions];if(exclusionConflict)questions.unshift({field:'exclusions',question:'同一对象同时被要求使用和排除，请澄清最终选择；本版不自动将后文当撤销。'});if(new Set(f.direct).size>1)questions.unshift({field:'VDD',question:'澄清BME280 VDD实际电压与连接；同一引脚出现两个直供电压，未执行参数比较。'});
 const requirement_status=conflicting?'CONFLICTING':f.parsed.complete?'COMPLETE':'NEEDS_CLARIFICATION';
 const report={schema_version:'therm-limited-audit-0.1',input:{text},baseline:{snapshot_version:snapshot.version,snapshot_records_sha256:snapshot.records_sha256,audit_version:'public-audit-0.1'},requirement_facts:f.requirement_facts,requirement_status,questions,exclusions:f.exclusions,excluded_ids:[],scope_status:scope,retrieval_status:'NOT_QUERIED',queries:[],candidates:[],rejected_candidates:[],missing:[],blockers:[],verification:Object.fromEntries(['schematic_erc','pcb_netlist','drc','manufacturing','hardware'].map(k=>[k,{status:'NOT_RUN',reason:'本切片仅资料与字段审核，无该项工程运行证据'}])),overall_claim:scope==='OUT_OF_SCOPE'?'OUT_OF_SCOPE':'NEEDS_CLARIFICATION',design_approved:false,limitations:['资料命中不等于适配；字段MATCH不等于整机可行','仅已登记同物理量/同引脚数值比较；缺证据UNKNOWN','未重新审阅PDF；记录出处与工程师确认分开','有限排除语法以外先追问，不承诺通用否定理解']};
 const db=publicRecordReader(snapshot.records);
 try{
 const excluded=r=>f.exclusions.some(e=>e==='USB-C'?JSON.parse(r.raw_json).entity_type==='usb-c-receptacle':e==='BME280'?/BME280/i.test(r.mpn||''):e==='ESP32-S3'?/ESP32-S3/i.test((r.mpn||'')+' '+r.name):(r.mpn||'').toUpperCase()===e);
 report.evidence_queries=[];const catalogSQL='SELECT id,mpn,name,raw_json FROM records',all=f.exclusions.length?db.prepare(catalogSQL).all():[];if(f.exclusions.length)report.evidence_queries.push({purpose:'EXCLUSION_RESOLUTION_NOT_CANDIDATE_SELECTION',sql:catalogSQL,parameters:[],result_ids:all.map(r=>r.id),snapshot_records_sha256:report.baseline.snapshot_records_sha256});report.excluded_ids=all.filter(excluded).map(r=>r.id);
 if(requirement_status!=='COMPLETE'||scope!=='IN_SCOPE'){report.blockers.push({kind:scope==='OUT_OF_SCOPE'?'OUT_OF_SCOPE':'REQUIREMENT_UNRESOLVED',reason:scope==='OUT_OF_SCOPE'?'本版未实现控制执行器/安全审核；不判断物理不可行，也不生成控制电路':'需求存在冲突或缺项，未查询候选/未比较数值',next:'先澄清具体用途、对象、电源节点和缺失要求'});return report;}
 const result=core.retrieve(db,f.parsed.recognized);report.queries=result.queries.map(q=>({...q,snapshot_records_sha256:report.baseline.snapshot_records_sha256}));report.missing=result.missing;
 for(const m of result.matches){const row=db.prepare('SELECT * FROM records WHERE id = ?').get(m.id),raw=JSON.parse(row.raw_json);report.evidence_queries.push({purpose:'SOURCE_RECORD_TRACE',sql:'SELECT * FROM records WHERE id = ?',parameters:[m.id],result_ids:[row.id],snapshot_records_sha256:report.baseline.snapshot_records_sha256});if(excluded(row)){report.rejected_candidates.push({id:m.id,reason:'明确排除条件命中，不作为满足项',exclusions:f.exclusions});continue;}
 const publicRecordHash=recordHashes.get(row.id);
 const evidence={record_id:m.id,entity_type:m.entity_type,source_url:m.source_url,source_revision:m.source_revision,public_record_sha256:publicRecordHash,snapshot_records_sha256:report.baseline.snapshot_records_sha256,source_review:'FROZEN_PUBLIC_METADATA_ONLY_NO_ORIGINAL_FILE_OR_PDF_CHECK'};
 const constraints=m.constraints.filter(c=>c.field!=='supply').map(c=>({...c,requirement:{object:row.mpn||m.id,value:c.field==='model'?positive.sensor:c.field==='temperature_range'?positive.temperature_range_c:c.field==='accuracy'?positive.accuracy_c:null,unit:['temperature_range','accuracy'].includes(c.field)?'degC':null,condition:c.field==='model'?'仅指定身份一致，不代表电气适配':'只比较同对象已登记字段，测量条件缺失不推断'},level:c.field==='model'?'IDENTITY_ONLY':'RECORDED_FIELD_ONLY',evidence:{...evidence,field:c.field==='temperature_range'?'/params/temperature_range_c':c.field==='accuracy'?'/params/temperature_accuracy_c':c.field==='model'?'/mpn':'/params'}}));
 if(m.role==='sensor'){
 const rail=raw.params?.supply_vdd_v,v=f.direct[0],applies=f.explicitBare&&row.mpn==='BME280'&&m.entity_type==='bare_sensor_ic'&&v!==undefined;
 constraints.push({field:'vdd',status:applies&&rail&&Number.isFinite(rail.min)&&Number.isFinite(rail.max)?v>=rail.min&&v<=rail.max?'MATCH':'NOT_MET':'UNKNOWN',level:'RECORDED_FIELD_ONLY',requirement:{object:row.mpn,node:'VDD',value:v??null,unit:'V',condition:applies?'明确裸芯片VDD直供':'系统输入/未明电源路径不等于VDD引脚'},actual:rail??null,reason:applies?'仅比较明确裸芯片VDD与已登记范围，不推广到模块/整板':'芯片供电节点/电源路径未证实，不能用USB系统5V判直供冲突',evidence:{...evidence,field:'/params/supply_vdd_v',source_locator:rail?.source||null}});
 constraints.push({field:'system_power_path',status:'UNKNOWN',level:'CIRCUIT_NOT_VALIDATED',reason:'缺目标电源网络/电流/稳压与电平路径验证；直供字段MATCH也不证明整条路径',evidence});
 }
 report.candidates.push({id:m.id,name:m.name,role:m.role,entity_type:m.entity_type,quality_status:m.quality_status,reusable:m.reusable,evidence,constraints});
 }
 const hasSensor=report.candidates.some(c=>c.role==='sensor');if(!hasSensor&&!report.missing.some(x=>x.role==='sensor'))report.missing.push({role:'sensor',reason:'候选被明确排除，尚无满足指定身份的传感器记录'});
 report.retrieval_status=report.candidates.length?'FOUND':'NO_RECORD';
 for(const c of report.candidates)for(const k of c.constraints)if(k.status==='NOT_MET'||k.status==='UNKNOWN')report.blockers.push({kind:k.status,candidate_id:c.id,check:k.field,reason:k.reason,next:k.status==='NOT_MET'?'确认该候选/引脚条件并由EDA审查，不自动设计替代电源':'补充同对象/条件的已审核参数或电路证据',owner:'EDA / 需求确认'});
 for(const m of report.missing)report.blockers.push({kind:'NO_RECORD',role:m.role,reason:m.reason,next:'补目标器件的来源/版本/条件记录，不用其他型号冒充',owner:'EDA数据库'});
 report.overall_claim=report.candidates.some(c=>c.constraints.some(k=>k.status==='NOT_MET'))?'CANDIDATE_REQUIREMENT_NOT_MET':!hasSensor?'NO_MATCHING_RECORD':'CANDIDATES_ONLY';return report;
 }finally{db.close();}
}

function publicRecordReader(records){
 const filters=core.snapshotAdapter(records);
 return {prepare(selector){
  if(selector==='SELECT id,mpn,name,raw_json FROM records')return {all:()=>records.slice()};
  if(selector==='SELECT * FROM records WHERE id = ?')return {get:id=>records.find(r=>r.id===id)};
  return filters.prepare(selector);
 },close(){}};
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
async function reviewSnapshot(input,snapshot){
 if(!snapshot||snapshot.version!=='public-metadata-20261101-r1'||snapshot.records.length!==9)throw Error('资料快照版本不符，停止审核。');
 const actual=await digest(JSON.stringify(snapshot.records));
 if(actual!==snapshot.records_sha256||actual!=='98ce25861eae0764d4e9e2a94eeaa8b8f2c54e16635e2dc1fa8f38674d3c15d1')throw Error('资料快照校验不一致，停止审核，不沿用旧结论。');
 const hashes=new Map();for(const row of snapshot.records)hashes.set(row.id,await digest(JSON.stringify(row)));
 const report=reviewWithSnapshot(input,snapshot,hashes);
 for(const key of ['queries','evidence_queries']){
  report[key]=(report[key]||[]).map(q=>{const {sql,...rest}=q;return {...rest,operation:key==='queries'?'FIXED_ARRAY_FILTER':q.purpose==='SOURCE_RECORD_TRACE'?'LOOKUP_PUBLIC_RECORD_ID':'SCAN_PUBLIC_IDENTITIES',note:'浏览器数组操作，不执行SQL；无原始库/文件验证'};});
 }
 report.execution={mode:'BROWSER_FROZEN_SNAPSHOT',database_queried:false,sql_executed:false,input_uploaded:false,original_files_checked:false};
 report.limitations.push('固定公开元数据快照，非实时SQLite；公开记录哈希不是原始metadata/PDF审阅证据');
 return report;
}
root.PublicAudit={facts,reviewSnapshot};

})(globalThis);
