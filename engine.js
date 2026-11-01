// MIT; derived from the bounded 0.3 parser and constraint evaluator. See LICENSE and THIRD_PARTY_NOTICES.md.
(function(root){'use strict';
const PARSER_VERSION='bounded-rules-0.3';
function parseRequirement(text){
 if(typeof text!=='string'||!text.trim())throw Error('需要非空自然语言文本');
 const t=text.normalize('NFKC'),recognized={},questions=[],conflicts=[];
 const clarify=(reason,question)=>({text,recognized:{},questions:[{field:'interpretation',question}],conflicts:[reason],complete:false,parser:PARSER_VERSION,not_inferred:['未确定的排除、替代或型号角色不推断，不查询候选']});
 // Only these bounded negative phrases have a known meaning in this demo.
 // Every other exclusion/replacement is clarification, not a positive keyword hit.
 const unchecked=t
  .replace(/不(?:需要)?控制(?:加热|制冷|设备)?(?:[和或、及/]*(?:加热|制冷))?(?=\s*(?:[，,。；;\n]|$))/g,'')
  .replace(/(?:无需|不用|不需要)(?:加热|制冷)(?:[和或、及/]*(?:加热|制冷))?(?=\s*(?:[，,。；;\n]|$))/g,'')
  .replace(/((?:精度|误差|准确度)\s*)不超过(?=\s*[±+\-≤]*\s*\d+(?:\.\d+)?\s*(?:℃|°\s*C|度))/gi,'$1');
 if(/不|无|非|未|排除|避免|拒绝|禁止|替代|替换|改(?:用|为|成)|换(?:用|为|成)|\b(?:not|no|without|exclude|except|instead|rather)\b/i.test(unchecked))
  return clarify('UNRESOLVED_EXCLUSION_OR_REPLACEMENT','存在本版无法可靠解释的否定、排除或替代要求。请用一份不含排除/替换句的最终需求，明确用途、电源、范围、精度、输出及各型号角色；本次不查询候选。');
 const ask=(field,question)=>questions.push({field,question});
 const only=/(?:仅|只)(?:需|需要)?(?:测温|测量|监测|采集)|不(?:需要)?控制/.test(t);
 const ct=t.replace(/(?:精度|误差|准确度)控制在/g,'').replace(/不(?:需要)?控制(?:加热|制冷|设备)?(?:[和或、及/]*(?:加热|制冷))?/g,'').replace(/(?:无需|不用|不需要)(?:加热|制冷)/g,'');
 if(/控制|加热|制冷|恒温|温控器|继电器/.test(ct)){recognized.purpose='control_or_conflict';ask('purpose',only?'同时出现仅测量与控制要求，请明确用途。':'是否需要控制加热/制冷负载？本版仅支持测温显示，控制方案需另行确认。');}
 else if(only||/温度计|温度监测|温度采集|thermometer|temperature monitor/i.test(t))recognized.purpose='measurement_only';
 else ask('purpose','“温控计”是仅测温/显示，还是需要控制加热或制冷设备？');
 const volts=[...new Set([...t.matchAll(/(\d+(?:\.\d+)?)\s*v\b/gi)].map(m=>Number(m[1])))];
 if(volts.length>1){conflicts.push('MULTIPLE_SUPPLY_VOLTAGES');ask('power','发现多个电压，请区分系统输入与传感器供电；本版不推断多电源路径。');}
 else if(volts.length===1)recognized.power={voltage_v:volts[0],connector:/usb[ -]?c|type[ -]?c/i.test(t)?'USB-C':null,sensor_direct:/(?:传感器|芯片).{0,6}(?:直接|直连).{0,4}\d+(?:\.\d+)?\s*v/i.test(t)};
 else ask('power','采用什么输入电源和电压（例如 USB-C 5V）？');
 const ranges=[...t.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:℃|°\s*C|度)?\s*(?:到|至|~|—|–|-)\s*(-?\d+(?:\.\d+)?)\s*(?:℃|°\s*C|度)/gi)].map(m=>[Number(m[1]),Number(m[2])]);
 if(ranges.length&&ranges[0][0]<ranges[0][1]&&ranges.every(r=>JSON.stringify(r)===JSON.stringify(ranges[0])))recognized.temperature_range_c=ranges[0];
 else{if(ranges.length)conflicts.push('RANGE_CONFLICT');ask('temperature_range','需要测量的最低、最高温度是多少摄氏度？请给一个有效范围。');}
 const accuracy=[...t.matchAll(/(?:精度|误差|准确度)\s*(?:要求|为|不超过|在|控制在)?\s*[±+\-≤]*\s*(\d+(?:\.\d+)?)\s*(?:℃|°\s*C|度)/gi)].map(m=>Number(m[1]));
 if(accuracy.length&&accuracy[0]>0&&accuracy.every(a=>a===accuracy[0]))recognized.accuracy_c=accuracy[0];else ask('accuracy','允许温度误差是多少（例如 ±0.5℃）？');
 recognized.output_modes=[/屏|OLED|LCD|数码管/i.test(t)&&'screen',/串口|serial|uart/i.test(t)&&'serial',/wifi|wi-fi|联网|蓝牙/i.test(t)&&'network'].filter(Boolean);
 if(!recognized.output_modes.length)ask('output','测量结果需要屏幕、串口输出，还是联网查看？');
 const explicit=[...t.matchAll(/传感器\s*(?:采用|使用|指定|用|选|为|是)\s*([A-Za-z][A-Za-z0-9_-]*)/gi)].map(m=>m[1]);
 const sensors=[...new Set([...(t.match(/BME280|BMP280|DS18B20|DHT\d+|SHT\d+|PT1000?|NTC\d*|热电偶|铂电阻/gi)||[]),...explicit].map(s=>s.toUpperCase()))];
 if(sensors.length>1){conflicts.push('SENSOR_CONFLICT');ask('sensor','出现多个传感器型号，请明确指定型号还是要比较候选。');}
 recognized.sensor=sensors[0]||null;
 recognized.controller=(t.match(/ESP32(?:-S\d)?|STM32[\w-]*/i)||[null])[0]?.toUpperCase()||null;
 recognized.display_keyword=/OLED/i.test(t)?'OLED':/LCD/i.test(t)?'LCD':null;
 // Unknown model-shaped text must not silently become an unspecified sensor.
 // Explicit sensor roles may use any model, but retrieval stays exact-mpn only.
 const allowed=new Set([...sensors,...(t.match(/ESP32(?:-S\d)?|STM32[\w-]*/gi)||[]),'USB-C','USBC','TYPE-C','TYPEC','USB','C','V','OLED','LCD','UART','SERIAL','WIFI','WI-FI','THERMOMETER','TEMPERATURE','MONITOR'].map(s=>s.toUpperCase()));
 const unclassified=[...new Set((t.match(/[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*(?:\.[A-Za-z0-9]+)*/g)||[]).filter(s=>!allowed.has(s.toUpperCase())))];
 if(unclassified.length)return clarify('UNCLASSIFIED_TOKEN','以下型号或词语未能确定角色：'+unclassified.join('、')+'。请明确传感器/控制器/电源/显示等角色；未知传感器可写“传感器用XYZ123”进行精确查库，不会回退其他器件。本次不查询候选。');
 const controllers=[...new Set((t.match(/ESP32(?:-S\d)?|STM32[\w-]*/gi)||[]).map(s=>s.toUpperCase()))];
 if(controllers.length>1){conflicts.push('CONTROLLER_CONFLICT');ask('controller','出现多个控制器型号，请提供最终明确型号；本版不推断替代关系。');}
 if(/防水|医疗|安全联锁|防爆/.test(t))ask('extra_constraints','存在本版未处理的防护或安全用途要求，请另行确认。');
 return {text,recognized,questions,conflicts,complete:questions.length===0,parser:PARSER_VERSION,not_inferred:['未指定型号不默认选择BME280或ESP32-S3','未推断负载控制、电流预算、板尺寸或引脚方案']};
}

function retrieve(db,intent){
 const queries=[],matches=[],missing=[];
 function search(role,where,parameters){
  const sql='SELECT id,name,kind,mpn,source_url,source_revision,license,quality_status,reusable,raw_json FROM records WHERE '+where+' ORDER BY id';
  const rows=db.prepare(sql).all(...parameters);queries.push({role,sql,parameters,result_ids:rows.map(r=>r.id)});
  if(!rows.length)missing.push({role,reason:'当前索引没有符合检索字段的记录；不返回其他固定型号代替'});
  for(const row of rows){
   const raw=JSON.parse(row.raw_json),constraints=[];
   const check=(field,status,actual,reason)=>constraints.push({field,status,actual:actual??null,reason});
   if(role==='sensor'){
    if(intent.sensor)check('model',row.mpn?.toUpperCase()===intent.sensor?'MATCH':'NOT_MET',row.mpn,'按实际mpn查询；模块不是裸芯片');
    const range=raw.params?.temperature_range_c,a=raw.params?.temperature_accuracy_c;
    check('temperature_range',Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)?range[0]<=intent.temperature_range_c[0]&&range[1]>=intent.temperature_range_c[1]?'MATCH':'NOT_MET':'UNKNOWN',range,'库内结构化范围缺失时不从型号猜值');
    check('accuracy',typeof a==='number'&&a>0?a<=intent.accuracy_c?'MATCH':'NOT_MET':'UNKNOWN',a,'只比较库中明确温度精度；工程条件未审核');
    const rail=raw.params?.supply_vdd_v;
    check('supply',intent.power.sensor_direct&&rail&&Number.isFinite(rail.min)&&Number.isFinite(rail.max)?intent.power.voltage_v>=rail.min&&intent.power.voltage_v<=rail.max?'MATCH':'NOT_MET':'UNKNOWN',rail,intent.power.sensor_direct?'按用户明确的传感器直供电压比较':'系统输入不等于芯片供电；未批准电源路径');
   }else check('specification','UNKNOWN',raw.params,'仅按类别或名称找到资料；供电、电流、机械、接口适配未证明');
   matches.push({role,id:row.id,name:row.name,kind:row.kind,entity_type:raw.entity_type||null,mpn:row.mpn,source_url:row.source_url,source_revision:row.source_revision,license:row.license,quality_status:row.quality_status,reusable:row.reusable===1,constraints,assessment:constraints.some(c=>c.status==='NOT_MET')?'NOT_MET':constraints.some(c=>c.status==='UNKNOWN')?'UNKNOWN':'FIELD_MATCH_ONLY',limitations:['检索匹配不等于选型或复用批准',...(raw.open_questions||[]),...(raw.eda_library_candidate?.limitations||[])]});
  }
 }
 if(intent.sensor)search('sensor','kind = ? AND upper(mpn) = ?',['component',intent.sensor]);
 else search('sensor','kind = ? AND (name LIKE ? OR name LIKE ? OR lower(raw_json) LIKE ?)',['component','%温度%','%温湿%','%temperature%']);
 if(intent.power.connector==='USB-C')search('connector',"kind = ? AND json_extract(raw_json,'$.entity_type') = ?",['component','usb-c-receptacle']);
 search('power',"kind = ? AND json_extract(raw_json,'$.entity_type') = ?",['component','power-regulator']);
 if(intent.controller){search('controller','kind = ? AND upper(mpn) LIKE ?',['component','%'+intent.controller+'%']);search('reference_context','kind = ? AND upper(name) LIKE ?',['reference_design','%'+intent.controller+'%']);}
 if(intent.output_modes.includes('screen'))search('display','kind = ? AND (upper(name) LIKE ? OR upper(mpn) LIKE ?)',['component','%'+(intent.display_keyword||'显示')+'%','%'+(intent.display_keyword||'DISPLAY')+'%']);
 if(intent.output_modes.includes('network'))missing.push({role:'network',reason:'本版不验证网络协议、无线认证或驱动支持'});
 return {queries,matches,missing,unsupported_sensor:!!intent.sensor&&!matches.some(m=>m.role==='sensor'),retrieval_scope:'实际mpn/name/entity_type检索；数值字段只在库中已存在时比较；参考板不代替控制器'};
}


function snapshotAdapter(records){return {prepare(sql){const where=sql.split(' WHERE ')[1]?.split(' ORDER BY ')[0];return {all(...p){let found;
 const like=(v,pattern)=>{let source='';for(const c of pattern){source+=c==='%'?'.*':c==='_'?'.':'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c;}return new RegExp('^'+source+'$','i').test(v||'');};
 const all=records.filter(r=>r.kind===p[0]);
 if(where==='kind = ? AND upper(mpn) = ?')found=all.filter(r=>r.mpn?.toUpperCase()===p[1]);
 else if(where==='kind = ? AND (name LIKE ? OR name LIKE ? OR lower(raw_json) LIKE ?)')found=all.filter(r=>like(r.name,p[1])||like(r.name,p[2])||like(r.raw_json.toLowerCase(),p[3]));
 else if(where==="kind = ? AND json_extract(raw_json,'$.entity_type') = ?")found=all.filter(r=>JSON.parse(r.raw_json).entity_type===p[1]);
 else if(where==='kind = ? AND upper(mpn) LIKE ?')found=all.filter(r=>like(r.mpn,p[1]));
 else if(where==='kind = ? AND upper(name) LIKE ?')found=all.filter(r=>like(r.name,p[1]));
 else if(where==='kind = ? AND (upper(name) LIKE ? OR upper(mpn) LIKE ?)')found=all.filter(r=>like(r.name,p[1])||like(r.mpn,p[2]));
 else throw Error('Unsupported snapshot filter');
 return found.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 }};}};}
function evaluateSnapshot(text,snapshot){
 if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('请填写1—8000字的需求。');
 const parsed=parseRequirement(text),base={demo:'browser-snapshot-0.1',parsed,snapshot:{version:snapshot.version,records:snapshot.records.length,records_sha256:snapshot.records_sha256},database_queried:false,snapshot_queried:false,status:'NEEDS_CLARIFICATION',approved_for_reuse:false,design_generated:false,limitations:['浏览器内的有限规则解析与公开元数据快照过滤，不执行SQL，不连接Node服务','资料快照不是实时SQLite，可能过时','所有候选仅供核查，不批准选型或复用，不生成整板']};
 if(!parsed.complete)return {...base,queries:[],matches:[],missing:[]};
 const r=retrieve(snapshotAdapter(snapshot.records),parsed.recognized);
 return {...base,...r,status:'CANDIDATES_ONLY',snapshot_queried:true,queries:r.queries.map(q=>({role:q.role,filter_description:q.sql,parameters:q.parameters,result_ids:q.result_ids,note:'等效过滤描述，仅数组筛选，未执行SQL'}))};
}
const api={retrieve,parseRequirement,evaluateSnapshot,snapshotAdapter};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ThermEngine=api;
})(globalThis);
