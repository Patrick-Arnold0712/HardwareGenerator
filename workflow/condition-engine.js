// MIT. Limited condition review derived from reviewed r2. See LICENSE and THIRD_PARTY_NOTICES.md.
(function(root){'use strict';const SNAPSHOT_HASH='3ad599c884aedab51d96843e417df0de928ff7ef586960ac35370392a0edf1f9';
function freezeDeep(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freezeDeep(v);Object.freeze(value);}return value;}
function makeReviewer(record){const sensor=record.temperature_sensor;
function evidence(pointer,row){return {record_id:record.record_id,record_revision:record.record_revision,public_snapshot_sha256:SNAPSHOT_HASH,source_url:record.source.url,field:pointer.replace('/params/','/data/'),page:row?.page||null,table:row?.table||null,column:row?.column||null,footnotes:row?.footnotes||(row?.footnote?[row.footnote]:[]),review_status:sensor.review_status,review:'FIXED_PUBLIC_METADATA_NO_LIVE_LIBRARY_OR_PDF_RECHECK'};}
function review(request){
 const r={version:'temperature-condition-review-0.1',baseline:{version:record.version,record_revision:record.record_revision,public_snapshot_sha256:SNAPSHOT_HASH},request,requirements:'COMPLETE',questions:[],scope:'IN_SCOPE',operating_range:{status:'UNKNOWN'},full_accuracy_range_reference:{status:'UNKNOWN'},typical_rows:[],typical_condition_coverage:'UNKNOWN',guaranteed_accuracy:{status:'UNKNOWN',reason:'当前记录全部为Typ，不能转为保证上限；缺目标测量条件与工程证据'},measurement_caveat:{...sensor.measurement_caveat,evidence:evidence('/params/temperature_sensor/measurement_caveat',sensor.measurement_caveat)},next_evidence:['EDA/硬件工程师确认内部温度与目标测量对象、板温/自热/安装条件','取得对应温区与条件下可支撑所需误差的保证或目标实测证据'],verification:Object.fromEntries(['schematic_erc','pcb_netlist','drc','manufacturing','hardware'].map(k=>[k,'NOT_RUN'])),design_approved:false};
 const range=request?.temperature_range_c,error=request?.allowed_error_c;
 r.version='temperature-condition-browser-0.2';
 r.snapshot_semantics={mode:'FIXED_PUBLIC_SNAPSHOT_ONLY',public_snapshot_sha256:SNAPSHOT_HASH,validation_timing:'EACH_LOCAL_REVIEW',runtime_data:'FROZEN_PUBLIC_FACTS_COPY',live_library_checked:false,live_index_checked:false,live_pdf_checked:false,input_uploaded:false,warning:'本页只核对随站固定公开快照，不实时读取数据库/索引/PDF，原资料变化不会自动让本快照失效或更新。快照身份仅追溯采集版本，不是本次原文重检。新资料须另版复核。'};
 r.boundary_notices=[];
 r.typical_coverage_caveat='Typ条件参考覆盖不是保证精度；不得据此认定含端点的全区间已满足目标。';
 if(!request||request.object!=='BME280 bare IC'){r.requirements='NEEDS_CLARIFICATION';r.scope='NEEDS_CLARIFICATION';r.questions.push('请确认对象为BME280裸芯片；本切片不等同GY模块或开发板。');}
 if(!['internal_sensor_temperature','ambient_temperature'].includes(request?.quantity)){r.requirements='NEEDS_CLARIFICATION';r.questions.push('请明确是内部传感器温度还是环境温度，不默认两者相同。');}
 if(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]>range[1]||!Number.isFinite(error)||error<=0||request?.unit!=='degC'){r.requirements='NEEDS_CLARIFICATION';r.questions.push('需有效温度区间、正的允许误差，单位degC。');}
 if(r.requirements!=='COMPLETE')return r;
 const internal=request.quantity==='internal_sensor_temperature',[lo,hi]=range,point=lo===hi;
 function rangeCheck(field,row){return {status:internal?(row&&Number.isFinite(row.min)&&Number.isFinite(row.max)?lo>=row.min&&hi<=row.max?'MATCH':'NOT_MET':'UNKNOWN'):'UNKNOWN',level:'DECLARED_INTERNAL_TEMPERATURE_RANGE_FIELD_ONLY',requirement:range,actual:row?{min:row.min,max:row.max}:null,reason:internal?'仅范围字段比较，不是误差保证或环境温度适配':'请求为环境温度，未证明与内部温度相等，不能直接套用范围',evidence:evidence('/params/temperature_sensor/'+field,row)};}
 r.operating_range=rangeCheck('operating_range_c',sensor.operating_range_c);
 r.full_accuracy_range_reference=rangeCheck('full_accuracy_range_c',sensor.full_accuracy_range_c);
 r.full_accuracy_range_reference.reason+='；full-accuracy范围仍须读条件化Typ行，不等于保证误差';
 const rows=sensor.absolute_accuracy_c||[];
 const pointIntervals=point?rows.filter(row=>row.temperature_condition_c?.at===undefined&&Number.isFinite(row.temperature_condition_c?.min)&&Number.isFinite(row.temperature_condition_c?.max)&&lo>=row.temperature_condition_c.min&&lo<=row.temperature_condition_c.max):[];
 const covered=[];
 for(const [i,row]of rows.entries()){
 const c=row.temperature_condition_c||{},isPoint=Number.isFinite(c.at),a=isPoint?c.at:c.min,b=isPoint?c.at:c.max;
 const valid=Number.isFinite(a)&&Number.isFinite(b)&&a<=b,intersects=valid&&Math.max(lo,a)<=Math.min(hi,b),intersection=intersects?[Math.max(lo,a),Math.min(hi,b)]:null;
 let applicability=!internal?'UNKNOWN_DIFFERENT_MEASURAND':!valid?'UNKNOWN_SOURCE_CONDITION':!intersects?'OUTSIDE_REQUEST':isPoint&&!point?'POINT_ONLY_NOT_RANGE_COVERAGE':point&&pointIntervals.length>1?'BOUNDARY_REQUIRES_REVIEW':!point&&intersection[0]===intersection[1]?'BOUNDARY_TOUCH_ONLY':'APPLICABLE_REFERENCE_ONLY';
 const usable=applicability==='APPLICABLE_REFERENCE_ONLY'&&row.column==='Typ'&&Number.isFinite(row.typical_magnitude_c);
 const item={temperature_condition_c:c,intersection_c:internal?intersection:null,applicability,column:row.column||'UNKNOWN',typical_magnitude_c:row.typical_magnitude_c??null,guarantee:row.guarantee||'TYPICAL_NOT_A_GUARANTEED_MAXIMUM',numeric_reference_comparison:usable?row.typical_magnitude_c<=error?'TYPICAL_NUMBER_WITHIN_TARGET':'TYPICAL_NUMBER_EXCEEDS_TARGET':'NOT_COMPARED',accuracy_guarantee_status:'UNKNOWN',evidence:evidence('/params/temperature_sensor/absolute_accuracy_c/'+i,row)};
 r.typical_rows.push(item);if(usable)covered.push(intersection);
 }
 if(internal){if(point)r.typical_condition_coverage=covered.some(x=>x[0]===lo&&x[1]===hi)?'COVERED_FOR_TYPICAL_REFERENCE_ONLY':'NOT_COVERED_OR_BOUNDARY_UNRESOLVED';else{let edge=lo;for(const [a,b]of covered.sort((x,y)=>x[0]-y[0])){if(a>edge)break;edge=Math.max(edge,b);}r.typical_condition_coverage=edge>=hi?'COVERED_FOR_TYPICAL_REFERENCE_ONLY':'NOT_FULLY_COVERED';}}
 if(!internal)r.guaranteed_accuracy.reason='环境温度与内部温度未证明等同；脚注7记录板温/自热影响，不能许诺环境读数误差';
 if(r.typical_rows.some(x=>x.numeric_reference_comparison==='TYPICAL_NUMBER_EXCEEDS_TARGET'))r.next_evidence.unshift('部分条件段的Typ数值已大于目标误差；记录风险，仍不能把非保证Typ当成产品必然不满足');
 if(r.typical_rows.some(x=>x.applicability==='BOUNDARY_REQUIRES_REVIEW'))r.next_evidence.unshift('温区端点落入相邻行，需要确认原表边界含义，不任选有利一行');
 for(const row of r.typical_rows){if(['BOUNDARY_TOUCH_ONLY','BOUNDARY_REQUIRES_REVIEW'].includes(row.applicability))r.boundary_notices.push({type:row.applicability,temperature_condition_c:row.temperature_condition_c,intersection_c:row.intersection_c,numeric_reference_comparison:row.numeric_reference_comparison,guarantee:row.guarantee,evidence:row.evidence,message:row.applicability==='BOUNDARY_TOUCH_ONLY'?'请求包含温区端点，本行只在端点接触且NOT_COMPARED；不能只用另一行“Typ数值在目标内”宣称包含该端点的全区间符合。':'精确共享端点落入相邻行，边界含义未确认，不任选有利一行。'});}
 if(r.boundary_notices.length){r.next_evidence.unshift('端点待确认：保留所有接触/相邻行、NOT_COMPARED、Typ与脚注；由EDA确认端点条件后再谈含端点全区间，不把正温Typ目标内当全区间已满足。');r.typical_coverage_caveat='存在未确认端点：参考覆盖只描述区间内部/已适用行；端点接触行未比较，不代表含端点的全区间Typ条件符合，更不是保证精度。';}
 return r;
}
return review;}

async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
async function review(request,snapshot){
 if(!snapshot||snapshot.data?.version!=='BME280-conditional-public-r2-20261101-r1')throw Error('固定公开快照版本不符，停止核对。');
 const actual=await sha(JSON.stringify(snapshot.data));if(actual!==snapshot.snapshot_sha256||actual!==SNAPSHOT_HASH)throw Error('固定公开快照内容变化，停止核对；需另版复核。');
 const record=freezeDeep(JSON.parse(JSON.stringify(snapshot.data)));return makeReviewer(record)(request);
}
root.ConditionReview={review};})(globalThis);
