'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {generate}=require('./lib03-export');
const {scanLibrary}=require('./library-core');
const ENTITIES=['parts','reference_designs','modules','projects','validation_runs'];
function verifyEntities(observed,manifest){
 const sort=a=>a.map(r=>r.id+'@'+r.version).sort();
 for(const table of ENTITIES){assert.deepEqual(sort(observed.tables[table]),sort(manifest.records.filter(r=>r.entity===table)),'ENTITY_MISMATCH_'+table);}
 const stableLinks=a=>a.map(l=>[l.from_id,l.from_version,l.to_id,l.to_version,l.relation].join('@')).sort();assert.deepEqual(stableLinks(observed.tables.entity_links),stableLinks(manifest.links||[]),'LINK_SET_MISMATCH');
 for(const table of [...ENTITIES,'sources','entity_links']){
  const cs=observed.constraints.filter(c=>c.table===table);assert.equal(cs.filter(c=>c.type==='p').length,1,'MISSING_PRIMARY_KEY_'+table);
  const key=table==='entity_links'?'from_id, from_version, to_id, to_version, relation':'id, version';assert.ok(cs.some(c=>c.type==='p'&&c.def===`PRIMARY KEY (${key})`),'WRONG_PRIMARY_KEY_'+table);
  const fields=table==='sources'?['id','version','metadata_sha256','raw_json']:table==='entity_links'?['from_id','from_version','to_id','to_version','relation']:['id','version'];
  const columns=observed.columns.filter(c=>c.table===table);assert.deepEqual(columns.map(c=>c.name),fields,'COLUMN_SET_'+table);for(const c of columns){assert.equal(c.nullable,'NO','NULLABLE_'+table+'.'+c.name);assert.equal(c.type,c.name==='raw_json'?'jsonb':'text','COLUMN_TYPE_'+table+'.'+c.name);}
  if(ENTITIES.includes(table))assert.ok(cs.some(c=>c.type==='f'&&c.def==='FOREIGN KEY (id, version) REFERENCES hg_lib03.sources(id, version)'), 'MISSING_SOURCE_FK_'+table);
  if(table==='entity_links')for(const p of ['from','to'])assert.ok(cs.some(c=>c.type==='f'&&c.def===`FOREIGN KEY (${p}_id, ${p}_version) REFERENCES hg_lib03.sources(id, version)`),'MISSING_LINK_FK_'+p);
 }
 return Object.fromEntries(Object.entries(observed.tables).map(([t,rs])=>[t,rs.length]));
}
function validate(c){
 if(!c||c.host!=='127.0.0.1')throw Error('LOCALHOST_ONLY');
 if(!Number.isInteger(c.port)||c.port<1024||c.port>65535)throw Error('EXPLICIT_HIGH_PORT_REQUIRED');
 if(!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(c.database)||!/^hg_lib03_[a-zA-Z0-9_]+$/.test(c.database))throw Error('DEDICATED_DATABASE_REQUIRED');
 if(!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(c.user))throw Error('INVALID_USER');
 if(!path.isAbsolute(c.psql)||!fs.statSync(c.psql).isFile())throw Error('EXPLICIT_PSQL_REQUIRED');
 if(Object.keys(c).some(k=>!['host','port','database','user','psql'].includes(k)))throw Error('UNKNOWN_CONFIG_FIELD');
 return c;
}
function execute(mode,c,root,out){
 validate(c);if(!['import','verify'].includes(mode))throw Error('INVALID_MODE');
 const generated=generate(root),library=scanLibrary(root);if(library.fingerprint!==generated.manifest.source_fingerprint)throw Error('SOURCE_CHANGED');
 fs.mkdirSync(out);const commands=[];
 const env={...process.env};for(const key of Object.keys(env))if(key.toUpperCase().startsWith('PG'))delete env[key];env.PGCONNECT_TIMEOUT='5';
 const args=['-X','-w','-h',c.host,'-p',String(c.port),'-U',c.user,'-d',c.database,'-v','ON_ERROR_STOP=1','-A','-t'];
 function run(name,sql){fs.writeFileSync(path.join(out,name+'.sql'),sql,{flag:'wx'});const started_at=new Date().toISOString(),r=cp.spawnSync(c.psql,[...args,'-f',path.resolve(out,name+'.sql')],{encoding:'utf8',env,timeout:60000,maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,name+'.stdout.log'),r.stdout||'');fs.writeFileSync(path.join(out,name+'.stderr.log'),r.stderr||'');commands.push({name,executable:c.psql,args:[...args,'-f',path.resolve(out,name+'.sql')],started_at,ended_at:new Date().toISOString(),exit_code:r.status,error:r.error?.code||null});fs.writeFileSync(path.join(out,'commands.json'),JSON.stringify(commands,null,2));if(r.status!==0)throw Error('PSQL_FAILED_'+name);return r.stdout.trim();}
 if(mode==='import'){
  const exists=run('preflight',"BEGIN READ ONLY; SELECT count(*) FROM information_schema.schemata WHERE schema_name='hg_lib03'; COMMIT;").split(/\r?\n/).filter(x=>/^\d+$/.test(x));if(exists[0]!=='0')throw Error('SCHEMA_EXISTS_NO_OVERWRITE');
  run('import',generated.sql);
 }
 const raw=run('verify',"BEGIN READ ONLY; SELECT json_agg(t) FROM (SELECT id,version,metadata_sha256,raw_json FROM hg_lib03.sources ORDER BY id) t; COMMIT;");
 const line=raw.split(/\r?\n/).filter(x=>!['BEGIN','COMMIT'].includes(x.trim())).join('\n');if(!line)throw Error('EMPTY_OR_INVALID_RESULT');const rows=JSON.parse(line);assert.equal(rows.length,library.items.length);
 for(const row of rows){const item=library.items.find(i=>i.record.id===row.id);assert.ok(item);assert.equal(row.version,item.metadataSha256);assert.equal(row.metadata_sha256,item.metadataSha256);assert.deepEqual(row.raw_json,item.record);}
 const tableSql=[...ENTITIES,'entity_links'].map(t=>`'${t}',(SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT * FROM hg_lib03.${t}) x)`).join(',');
 const structure=run('verify-entities',`BEGIN READ ONLY; SELECT json_build_object('tables',json_build_object(${tableSql}),'columns',(SELECT json_agg(x) FROM (SELECT table_name AS table,column_name AS name,data_type AS type,is_nullable AS nullable FROM information_schema.columns WHERE table_schema='hg_lib03' ORDER BY table_name,ordinal_position) x),'constraints',(SELECT json_agg(x) FROM (SELECT cl.relname AS table, c.contype AS type, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class cl ON c.conrelid=cl.oid JOIN pg_namespace ns ON cl.relnamespace=ns.oid WHERE ns.nspname='hg_lib03') x)); COMMIT;`);
 const entityCounts=verifyEntities(JSON.parse(structure.split(/\r?\n/).filter(x=>!['BEGIN','COMMIT'].includes(x.trim())).join('\n')),generated.manifest);
 const result={mode,valid:true,count:rows.length,entity_counts:entityCounts,source_fingerprint:library.fingerprint,scope:'source equality, entity membership, primary/foreign key existence; no engineering approval'};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
if(require.main===module){try{const [mode,config,root,out]=process.argv.slice(2);if(!out)throw Error('Usage: node scripts/lib03-postgres.js <import|verify> <config.json> <library-root> <new-evidence-directory>');console.log(JSON.stringify(execute(mode,JSON.parse(fs.readFileSync(config,'utf8').replace(/^\uFEFF/,'')),root,out)));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={validate,execute,verifyEntities};

