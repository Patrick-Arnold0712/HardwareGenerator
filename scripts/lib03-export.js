'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {scanLibrary,assertValid}=require('./library-core');
const tables=['parts','reference_designs','modules','projects','validation_runs'];
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
function generate(root){
 const library=scanLibrary(root);assertValid(library);
 for(const item of library.items){
  if(item.record.lib03_links!==undefined&&!Array.isArray(item.record.lib03_links))throw Error('INVALID_EXPLICIT_LINKS');
  if(/\u0000/.test(JSON.stringify(item.record).replaceAll('\\u0000','\u0000')))throw Error('POSTGRES_NUL_UNSUPPORTED');
 }
 const counts=Object.fromEntries(tables.map(t=>[t,0]));
 const sql=['\\set ON_ERROR_STOP on','BEGIN;','SET LOCAL standard_conforming_strings = on;','CREATE SCHEMA hg_lib03;','CREATE TABLE hg_lib03.sources (id text NOT NULL, version text NOT NULL, metadata_sha256 text NOT NULL, raw_json jsonb NOT NULL, PRIMARY KEY(id,version));'];
 for(const t of tables)sql.push(`CREATE TABLE hg_lib03.${t} (id text NOT NULL, version text NOT NULL, PRIMARY KEY(id,version), FOREIGN KEY(id,version) REFERENCES hg_lib03.sources(id,version));`);
 sql.push('CREATE TABLE hg_lib03.entity_links (from_id text NOT NULL, from_version text NOT NULL, to_id text NOT NULL, to_version text NOT NULL, relation text NOT NULL, PRIMARY KEY(from_id,from_version,to_id,to_version,relation), FOREIGN KEY(from_id,from_version) REFERENCES hg_lib03.sources(id,version), FOREIGN KEY(to_id,to_version) REFERENCES hg_lib03.sources(id,version));');
 const records=[];
 for(const item of library.items){const r=item.record,v=item.metadataSha256,t={component:'parts',reference_design:'reference_designs',module:'modules',project:'projects',validation:'validation_runs'}[r.kind]||null;
 sql.push(`INSERT INTO hg_lib03.sources VALUES (${quote(r.id)},${quote(v)},${quote(v)},${quote(JSON.stringify(r))}::jsonb);`);
 if(t){sql.push(`INSERT INTO hg_lib03.${t} VALUES (${quote(r.id)},${quote(v)});`);counts[t]++;}
 records.push({id:r.id,version:v,entity:t,source_only:!t});}
 const links=[],seen=new Set();
 for(const item of library.items)for(const link of item.record.lib03_links||[]){
  const target=library.items.find(i=>i.record.id===link.to_id),e=link.evidence;
  if(item.record.kind!=='reference_design'||!target||target.record.kind!=='component'||link.relation!=='uses_part'||link.target_version!==target.metadataSha256)throw Error('INVALID_LINK_IDENTITY_OR_VERSION');
  if(!e||typeof e.locator!=='string'||!e.locator.trim()||typeof link.fact_reviewed_by!=='string'||!link.fact_reviewed_by.trim()||link.source_fact_review!=='confirmed')throw Error('MISSING_LINK_FACT_REVIEW');
  const file=(item.record.files||[]).find(f=>f.path===e.path&&f.sha256===e.sha256);if(!file)throw Error('LINK_EVIDENCE_NOT_DECLARED');
  const relation={from_id:item.record.id,from_version:item.metadataSha256,to_id:target.record.id,to_version:target.metadataSha256,relation:'uses_part'},key=JSON.stringify(relation);if(seen.has(key))throw Error('DUPLICATE_LINK');seen.add(key);links.push(relation);
 }
 links.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));for(const l of links)sql.push(`INSERT INTO hg_lib03.entity_links VALUES (${[l.from_id,l.from_version,l.to_id,l.to_version,l.relation].map(quote).join(',')});`);
 sql.push('COMMIT;');return {sql:sql.join('\n')+'\n',manifest:{format:'lib03-pg-export-0.2',source_fingerprint:library.fingerprint,records,counts,links,relations_inserted:links.length,limitations:['仅支持有明确来源事实审核的reference_design到component uses_part；不代表工程批准','projects/modules/validation_runs空表不代表已有记录','schema已存在时事务失败，不覆盖旧库']}};
}
function publish(root,out){const r=generate(root);if(fs.existsSync(out))throw Error('OUTPUT_EXISTS');const staging=path.resolve(out)+'.incomplete-'+crypto.randomUUID();fs.mkdirSync(staging);fs.writeFileSync(staging+'/migration.sql',r.sql,{flag:'wx'});fs.writeFileSync(staging+'/manifest.json',JSON.stringify(r.manifest,null,2),{flag:'wx'});fs.renameSync(staging,out);return r.manifest;}
if(require.main===module){try{const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Usage: node scripts/lib03-export.js <library-root> <new-output-directory>');console.log(JSON.stringify(publish(root,out).counts));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={generate,quote,publish};

