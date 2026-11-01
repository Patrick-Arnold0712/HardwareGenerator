'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {generate,quote}=require('../scripts/lib03-export');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {publish}=require('../scripts/lib03-export');
function fixture(records){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hg-lib03-'));records.forEach((r,i)=>{const d=path.join(root,'components',String(i));fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'metadata.json'),typeof r==='string'?r:JSON.stringify(r));});return root;}
const basic=()=>({id:'component:test:one',kind:'component',name:'测试',status:'not_downloaded',source:{},evidence:[]});
test('非法JSON/空ID/重复身份均拒绝且不发布目录',()=>{for(const rs of [['{'],[{...basic(),id:''}],[basic(),basic()]]){const root=fixture(rs),out=path.join(root,'export');assert.throws(()=>publish(root,out));assert.equal(fs.existsSync(out),false);}});
test('显式关系缺失目标不能静默忽略',()=>assert.throws(()=>generate(fixture([{...basic(),lib03_links:[{to_id:'missing'}]}])),/INVALID_LINK/));
test('PostgreSQL不支持NUL，导出前拒绝',()=>assert.throws(()=>generate(fixture([{...basic(),name:'a\u0000b'}])),/NUL/));
test('发布完整且重复输出拒绝覆盖',()=>{const root=fixture([basic()]),out=path.join(root,'export');publish(root,out);const before=fs.readFileSync(out+'/migration.sql','utf8');assert.throws(()=>publish(root,out),/OUTPUT_EXISTS/);assert.equal(fs.readFileSync(out+'/migration.sql','utf8'),before);});
test('SQL引用注入与反斜线保留，真实JSON仍在来源表',()=>{const root=fixture([{...basic(),name:"O'Brien\\sensor"}]);const r=generate(root);assert.ok(r.sql.includes("O''Brien"));assert.equal(r.manifest.relations_inserted,0);assert.match(r.sql,/FOREIGN KEY\(from_id,from_version\)/);});
test('真实源身份完整保留且导出可重复',()=>{const a=generate('library'),b=generate('library');assert.equal(a.sql,b.sql);assert.ok(a.manifest.records.length>=9);assert.ok(a.manifest.records.every(r=>/^[a-f0-9]{64}$/.test(r.version)));assert.ok(a.sql.startsWith('\\set ON_ERROR_STOP on\nBEGIN;'));assert.ok(a.sql.endsWith('COMMIT;\n'));assert.ok(!a.sql.includes('DROP '));assert.ok(!a.sql.includes('ON CONFLICT'));});
test('SQL字符串引号转义',()=>assert.equal(quote("a'b"),"'a''b'"));
test('有证据的reference→part明确关系；错误版本/重复/无定位/假hash拒绝',()=>{
 const crypto=require('node:crypto'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');const root=fixture([basic()]);
 const partVersion=sha(fs.readFileSync(path.join(root,'components/0/metadata.json'))),dir=path.join(root,'reference_designs/design');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/schematic.txt','fixture U4 TESTPART');const evidenceSha=sha(fs.readFileSync(dir+'/schematic.txt'));
 const link={to_id:basic().id,target_version:partVersion,relation:'uses_part',evidence:{path:'schematic.txt',sha256:evidenceSha,locator:'fixture U4'},fact_reviewed_by:'test-fixture-reviewer',source_fact_review:'confirmed'};
 const ref={...basic(),id:'reference_design:test:one',kind:'reference_design',files:[{path:'schematic.txt',sha256:evidenceSha}],lib03_links:[link]};const write=r=>fs.writeFileSync(dir+'/metadata.json',JSON.stringify(r));write(ref);const result=generate(root);assert.equal(result.manifest.relations_inserted,1);assert.match(result.sql,/INSERT INTO hg_lib03.entity_links/);
 for(const links of [[{...link,target_version:'0'.repeat(64)}],[link,link],[{...link,evidence:{...link.evidence,locator:''}}],[{...link,evidence:{...link.evidence,sha256:'0'.repeat(64)}}]]){write({...ref,lib03_links:links});assert.throws(()=>generate(root));}
});
