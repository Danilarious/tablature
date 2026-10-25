import { measuredAcceptance } from './measured-browser.mjs';
// Runs a built Next production server against a disposable notebook; never accepts a live data path.
import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const data = mkdtempSync(path.join(tmpdir(), 'bxb-runtime-'));
const env = { ...process.env, MUSIC_NOTEBOOK_DATA_DIR: data, NEXT_TELEMETRY_DISABLED: '1' };
const run = (args) => { const r = spawnSync('npm', args, { env, stdio: 'inherit' }); assert.equal(r.status, 0); };
run(['run', 'db:seed']);
if (!process.argv.includes('--skip-build')) run(['run', 'build']);
const port = 3107;
const base = `http://127.0.0.1:${port}`;
let log = '';
const acceptanceImage = process.env.BXB_ACCEPTANCE_IMAGE;
const containerName = `bxb-acceptance-${process.pid}`;
const server = acceptanceImage
  ? spawn('docker', ['run','--rm','--name',containerName,'-p',`127.0.0.1:${port}:3000`,'-v',`${data}:/data`,acceptanceImage], { stdio:['ignore','pipe','pipe'] })
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { env, stdio: ['ignore','pipe','pipe'] });
server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
let browser;
try {
  for (let i=0; i<100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r,200)); }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width:1440,height:1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(15000);
  const errors=[];page.on('pageerror', e => errors.push(e.message));
  console.log('browser started',data);
  await page.goto(base+'/quick-capture'); await page.getByRole('button',{name:'Create a New Composition',exact:true}).waitFor();
  await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').fill('Browser acceptance motif');
  await page.getByRole('button',{name:'New tuning / Edit pitches'}).click();
  await page.getByLabel('Tuning name', {exact:true}).fill('Browser alternate tuning');
  await page.getByLabel('Pitches, bass side to treble side').fill('D2 A2 D3 G3 B3');
  await page.getByRole('button',{name:'Save as new named tuning'}).click();
  assert.match(await page.getByRole('dialog').innerText(), /exactly 6/);
  await page.getByLabel('Pitches, bass side to treble side').fill('D2 A2 D3 G3 B3 E4');
  await page.getByRole('button',{name:'Save as new named tuning'}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').inputValue(),'Browser acceptance motif');
  await page.getByTitle('String 6, neck fret 2 (E2)',{exact:true}).click();
  await page.getByTitle('String 6, neck fret 5 (G2)',{exact:true}).click();
  await page.getByTitle('String 6, neck fret 5 (G2)',{exact:true}).click();
  await page.getByTitle('String 6, neck fret 7 (A2)',{exact:true}).click();
  await page.getByLabel('String 6 column 1',{exact:true}).fill('2');
  await page.getByLabel(/^Length/).selectOption('1/8');
  await page.getByLabel(/^Technique/).selectOption('h');
  await page.getByLabel(/^Bar after/).selectOption('single');
  await page.getByRole('button',{name:'Grace / passing note',exact:true}).click();
  await page.getByLabel('String 6 column 2',{exact:true}).fill('4');
  await page.getByLabel(/^Length/).selectOption('1/4');
  await page.getByLabel('String 6 column 3',{exact:true}).click();
  await page.getByRole('button',{name:'Rest',exact:true}).click();
  await page.getByLabel(/^TIME SIGNATURE/).selectOption('6/8');
  await page.getByLabel('TEMPO (BPM)').fill('92');
  await page.getByRole('button',{name:'ENABLE TAP TEMPO',exact:true}).click();
  await page.locator('h1').click();
  for (let i=0;i<4;i++) { await page.keyboard.press('Space'); await page.waitForTimeout(500); }
  assert.equal(await page.getByLabel('TEMPO (BPM)').inputValue(),'92');
  await page.getByRole('button',{name:/Use \d+ BPM/}).click();
  assert.ok(Number(await page.getByLabel('TEMPO (BPM)').inputValue()) >= 110);
  await page.getByLabel('TEMPO (BPM)').fill('92');
  for(let i=0;i<45;i++) await page.getByRole('button',{name:'ADD EVENT',exact:true}).click();
  await page.getByRole('button',{name:'Create a New Composition',exact:true}).click();
  await page.getByLabel('NEW COMPOSITION TITLE').fill('Browser acceptance composition');
  await page.getByLabel('PART / SECTION (OPTIONAL)').fill('Verse');
  await page.getByLabel('Available neck extent',{exact:true}).fill('32');
  // Exercise recovery across reload before attaching memory-only recordings.
  await page.waitForTimeout(600); await page.reload(); await page.getByRole('button',{name:'Create a New Composition',exact:true}).waitFor();
  assert.equal(await page.getByLabel('NEW COMPOSITION TITLE').inputValue(),'Browser acceptance composition');
  assert.equal(await page.getByLabel('Available neck extent',{exact:true}).inputValue(),'32');
  const sharedDraft = await page.evaluate(() => localStorage.getItem('bxb.quickCapture.draft.v1'));
  const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/8000)*6000),44+i*2);
  for(const name of ['Verse Take One.wav','Verse Take Two.wav']) await page.locator('input[type=file]').setInputFiles({name,mimeType:'audio/wav',buffer:wav});
  await page.route('**/api/quick-capture',route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'simulated capture failure'})}));
  await page.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click();
  await page.getByText(/Save failed/).waitFor();assert.match(await page.locator('body').innerText(),/Verse Take Two.wav/);
  await page.unroute('**/api/quick-capture');
  // Let the real server commit, then lose the response: retry must recover the same records.
  let committed;
  await page.route('**/api/quick-capture',async route => { const response=await route.fetch();committed=await response.json();await route.abort('failed'); });
  await page.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click();
  await page.getByText(/Save failed/).waitFor();
  assert.equal(await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').isDisabled(),true);
  await page.unroute('**/api/quick-capture');
  await page.route('**/api/quick-capture',async route => { await route.fetch();await route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({error:'proxy timeout after commit'})}); });
  const proxyResponse=page.waitForResponse(r=>r.url()===base+'/api/quick-capture' && r.status()===504);
  await page.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click();await proxyResponse;
  await page.getByText(/Save failed/).waitFor();assert.equal(await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').isDisabled(),true);
  await page.unroute('**/api/quick-capture');
  const savedResponse=page.waitForResponse(r=>r.url()===base+'/api/quick-capture' && r.status()===201);
  await page.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click();
  const saved=await (await savedResponse).json();await page.getByRole('link',{name:'View motif',exact:true}).waitFor();
  assert.equal(saved.motif.id,committed.motif.id);assert.equal(saved.composition.id,committed.composition.id);assert.equal(saved.replayed,true);
  const id=saved.motif.id;const compId=saved.composition.id;
  assert.deepEqual(JSON.parse(saved.motif.fretboardMap),[{stringIndex:0,fret:2},{stringIndex:0,fret:7}]);
  const cols=JSON.parse(saved.motif.tabData); assert.equal(cols[0].duration,'1/8');assert.equal(cols[0].kind,'grace');assert.equal(cols[0].technique,'h');assert.equal(cols[0].barlineAfter,'single');assert.equal(cols[2].rest,true);assert.equal(cols.length,49);
  await page.screenshot({path:path.join(data,'capture-success.png'),fullPage:true});
  await page.getByRole('link',{name:'View composition',exact:true}).click();await page.getByText('Browser acceptance composition',{exact:true}).waitFor();
  assert.match(await page.locator('body').innerText(),/Verse/);assert.equal(await page.locator(`#composition-${compId} audio`).count(),2);
  await page.goto(base+'/library#motif-'+id);await page.locator('#motif-'+id).waitFor();assert.match(await page.locator('#motif-'+id).innerText(),/Browser acceptance composition/);
  await page.goto(base+'/print/motif/'+id);await page.getByText('PRIMARY TRANSCRIPTION',{exact:true}).waitFor();
  assert.equal(await page.locator('audio').count(),2);
  await page.locator('audio').first().evaluate(async audio => { await audio.play(); });await page.waitForTimeout(250);assert.ok(await page.locator('audio').first().evaluate(a=>a.currentTime)>0);
  await page.pdf({path:path.join(data,'motif.pdf'),format:'Letter',printBackground:true});
  await page.screenshot({path:path.join(data,'motif.png'),fullPage:true});
  const media=await (await fetch(base+`/api/attachments?parentType=motif&parentId=${id}`)).json();assert.equal(media.length,2);assert.equal(readdirSync(path.join(data,'media')).filter(name=>!name.startsWith('.')).length,2);
  const range=await fetch(base+'/api/media/'+media[0].filePath,{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
  // A second tab with the old draft must retain changed edits/media on conflict.
  const other = await page.context().newPage(); other.setDefaultTimeout(12000);
  await other.goto(base+'/quick-capture');
  await other.evaluate(draft => localStorage.setItem('bxb.quickCapture.draft.v1',draft),sharedDraft);
  await other.reload(); await other.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').fill('Other tab changed idea');
  await other.locator('input[type=file]').setInputFiles({name:'Other take.wav',mimeType:'audio/wav',buffer:wav});
  const conflict = other.waitForResponse(r => r.url()===base+'/api/quick-capture' && r.status()===409);
  await other.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click(); await conflict;
  await other.getByRole('button',{name:'Save edited draft as a separate capture',exact:true}).waitFor();
  assert.match(await other.locator('body').innerText(),/Other take.wav/);
  assert.equal(await other.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').inputValue(),'Other tab changed idea');
  await other.getByRole('button',{name:'Save edited draft as a separate capture',exact:true}).click();
  const separate = other.waitForResponse(r=>r.url()===base+'/api/quick-capture' && r.status()===201);
  await other.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click();assert.notEqual((await (await separate).json()).motif.id,id);
  await other.close();
  // Inbox save then place the same saved motif, and capture directly into an existing section.
  await page.goto(base+'/quick-capture');await page.getByRole('button',{name:'Save to Motif Inbox',exact:true}).waitFor();
  await page.getByRole('button',{name:'Save to Motif Inbox',exact:true}).click();await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').fill('Inbox acceptance');
  let next=page.waitForResponse(r=>r.url()===base+'/api/quick-capture'&&r.status()===201);await page.getByRole('button',{name:'SAVE TO INBOX',exact:true}).click();const inbox=await (await next).json();
  await page.getByRole('button',{name:'Add to composition / Create composition from motif',exact:true}).click();
  await page.getByLabel(/^Composition/).selectOption(compId);await page.getByLabel('Section',{exact:true}).fill('Bridge');
  await page.getByRole('button',{name:'Place motif',exact:true}).click();await page.waitForURL('**/compositions#**');await page.getByText('Inbox acceptance',{exact:false}).waitFor();
  await page.goto(base+'/quick-capture');await page.getByRole('button',{name:'Add to Existing Composition',exact:true}).click();await page.getByLabel(/^COMPOSITION/).selectOption(compId);await page.getByLabel('PART / SECTION (OPTIONAL)').fill('Verse');
  await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').fill('Existing destination acceptance');next=page.waitForResponse(r=>r.url()===base+'/api/quick-capture'&&r.status()===201);await page.getByRole('button',{name:'SAVE & CONNECT',exact:true}).click();const existing=await (await next).json();assert.equal(existing.composition.id,compId);
  await page.goto(base+'/print/composition/'+compId);assert.match(await page.locator('body').innerText(),/Existing destination acceptance/);
  // Bad legacy section documents cannot crash capture, including the Inbox destination.
  const probeDb = new Database(path.join(data,'database','notebook.db'));
  const storedSections = probeDb.prepare('SELECT sections FROM compositions WHERE id = ?').get(compId).sections;
  try {
    for (const bad of ['{broken','{"not":"an array"}']) {
      probeDb.prepare('UPDATE compositions SET sections = ? WHERE id = ?').run(bad,compId);
      await page.goto(base+'/quick-capture');await page.getByRole('button',{name:'Save to Motif Inbox',exact:true}).waitFor();
      await page.getByRole('button',{name:'Add to Existing Composition',exact:true}).click();await page.getByLabel(/^COMPOSITION/).selectOption(compId);
      await page.getByRole('button',{name:'Save to Motif Inbox',exact:true}).click();
    }
  } finally { probeDb.prepare('UPDATE compositions SET sections = ? WHERE id = ?').run(storedSections,compId);probeDb.close(); }
  await measuredAcceptance(browser,base,data);
  assert.deepEqual(errors,[]);assert.ok(!/Error:|Functions cannot be passed|Attempted to call/.test(log),log);
  writeFileSync(path.join(data,'result.json'),JSON.stringify({data,id,compId,inboxId:inbox.motif.id,errors,checks:'shared-tab conflict and explicit separate save; dropped-response and proxy-504 recovery without duplicates; extent persistence; new/existing/inbox capture; failed save recovery; inline tuning; map toggle/reload; notation persistence; placement; composition visibility; print/PDF; audio playback/range'},null,2));
  console.log('Production runtime and browser acceptance PASS. Evidence:',data);
} finally {
  await browser?.close();if (acceptanceImage) spawnSync('docker',['stop',containerName]); else server.kill('SIGTERM');if (server.exitCode === null) await new Promise(resolve=>server.once('exit',resolve));writeFileSync(path.join(data,'server.log'),log);
}
