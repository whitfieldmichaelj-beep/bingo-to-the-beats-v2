import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Verification requires a local database');
const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const id=randomUUID(),host=`verify-${randomUUID()}`,code=`V${randomUUID().replaceAll('-','').slice(0,5).toUpperCase()}`;
async function insert(table,row){const keys=Object.keys(row);await pool.query(`INSERT INTO "${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(k=>row[k]));}
try{
const source=(await pool.query('SELECT g.* FROM "Game" g WHERE (SELECT count(*) FROM "BingoCard" b WHERE b."gameId"=g.id)>=25 ORDER BY g."createdAt" LIMIT 1')).rows[0];assert.ok(source,'A saved game with at least 25 cards is needed as fixture metadata');
await insert('User',{id:host,clerkId:host,updatedAt:new Date()});
await insert('Game',{...source,id,hostId:host,joinCode:code,title:'Temporary verification game',status:'READY',currentTrackId:null,startedAt:null,completedAt:null,isPractice:false,hostBillingRequired:false});
for(const track of (await pool.query('SELECT * FROM "GameTrack" WHERE "gameId"=$1',[source.id])).rows)await insert('GameTrack',{...track,id:randomUUID(),gameId:id,called:false,calledAt:null,playedAt:null});
for(const original of (await pool.query('SELECT * FROM "BingoCard" WHERE "gameId"=$1 LIMIT 100',[source.id])).rows){
const cardId=randomUUID();await insert('BingoCard',{...original,id:cardId,gameId:id,status:'AVAILABLE',playerName:null,playerKey:null,purchaseId:null});
for(const square of (await pool.query('SELECT * FROM "CardSquare" WHERE "cardId"=$1',[original.id])).rows)await insert('CardSquare',{...square,id:randomUUID(),cardId,marked:false,markedAt:null});
}
process.exitCode=await new Promise((resolve,reject)=>{const child=spawn('bash',['scripts/verify-local.sh'],{stdio:'inherit',env:{...process.env,JOIN_CODE:code}});child.on('error',reject);child.on('exit',status=>resolve(status??1));});
}finally{await pool.query('DELETE FROM "Game" WHERE id=$1',[id]);await pool.query('DELETE FROM "User" WHERE id=$1',[host]);await pool.end();console.log('Temporary verification game removed.');}
