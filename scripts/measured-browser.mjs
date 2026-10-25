import assert from 'node:assert/strict';
import path from 'node:path';
const draftKey='bxb.quickCapture.draft.v1';
async function draftWith(page, predicate) {
  await page.waitForFunction(({key,source}) => {
    const draft=JSON.parse(localStorage.getItem(key)||'null');
    return draft && new Function('draft',`return (${source})(draft)`)(draft);
  },{key:draftKey,source:predicate.toString()});
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),draftKey);
}
async function reachable(page, locator, width) {
  await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();
  assert.ok(box && box.x>=-1 && box.x+box.width<=width+1,`Control clipped horizontally: ${JSON.stringify(box)}`);
  await locator.click({trial:true});
}
export async function measuredAcceptance(browser, base, data) {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const suffix=viewport.width===390?'mobile':'desktop';
    const context=await browser.newContext({viewport,isMobile:suffix==='mobile',hasTouch:suffix==='mobile'});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{ if(message.type()==='error') errors.push(message.text()); });
    await page.goto(base+'/quick-capture');
    await page.getByLabel('Rhythm mode',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Rhythm mode',{exact:true}).inputValue(),'measured');
    assert.equal(await page.getByLabel(/^TIME SIGNATURE/).inputValue(),'4/4');
    const staff=page.getByRole('region',{name:'Scrollable tablature',exact:true});
    assert.equal(await staff.locator('[data-tab-event]').count(),4);
    assert.equal(await staff.locator('[data-barline="single"]').count(),1);
    const initial=await draftWith(page,d=>d.tabColumns.length===4&&d.tabColumns.every(e=>e.autoRest&&e.rest&&e.duration==='1/4'));
    assert.equal(initial.timeSignature,'4/4');
    // Meter changes repopulate a pristine measure, including compound grouping.
    for(const [meter,count,duration] of [['3/4',3,'1/4'],['6/8',6,'1/8'],['2/4',2,'1/4'],['5/4',5,'1/4'],['7/8',7,'1/8'],['9/8',9,'1/8'],['12/8',12,'1/8'],['4/4',4,'1/4']]) {
      await page.getByLabel(/^TIME SIGNATURE/).selectOption(meter);
      await draftWith(page,d=>d.tabColumns.every(e=>e.autoRest&&e.rest));
      assert.equal(await staff.locator('[data-tab-event]').count(),count);
      const captions=await staff.locator('[data-tab-event]').allTextContents();
      assert.ok(captions.every(text=>text.includes(duration==='1/8'?'eighth':'quarter')));
      if(meter==='6/8') assert.equal(await staff.locator('[data-compound-group]').count(),1);
    }
    // Generated -> explicit rest -> generated. Explicit rests protect timing too.
    await page.getByRole('button',{name:'Make explicit rest',exact:true}).click();
    const explicit=await draftWith(page,d=>d.tabColumns[0].rest&&!d.tabColumns[0].autoRest);
    await page.getByLabel(/^TIME SIGNATURE/).selectOption('3/4');
    assert.equal(await staff.locator('[data-tab-event]').count(),4);
    await page.getByText('TIME SIGNATURE · METER FOR NEXT MEASURE',{exact:true}).waitFor();
    await draftWith(page,d=>d.timeSignature==='3/4');
    await page.reload(); await page.getByRole('button',{name:'Make editable rest',exact:true}).waitFor();
    const restoredExplicit=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),draftKey);
    assert.deepEqual(restoredExplicit.tabColumns,explicit.tabColumns);
    await page.getByRole('button',{name:'Make editable rest',exact:true}).click();
    await draftWith(page,d=>d.tabColumns[0].rest&&d.tabColumns[0].autoRest);
    await page.getByLabel(/^TIME SIGNATURE/).selectOption('4/4');
    await page.getByLabel('String 6 column 1',{exact:true}).fill('3');
    await draftWith(page,d=>d.tabColumns[0].notes.length===1&&!d.tabColumns[0].rest&&!d.tabColumns[0].autoRest);
    // Clearing the last note also returns to a semantically valid generated rest.
    await page.getByLabel('String 6 column 1',{exact:true}).fill('');
    await draftWith(page,d=>d.tabColumns[0].notes.length===0&&d.tabColumns[0].rest&&d.tabColumns[0].autoRest);
    await page.getByLabel('String 6 column 1',{exact:true}).fill('3');
    await page.getByLabel('String 6 column 2',{exact:true}).fill('5');
    const explicitNotes=await draftWith(page,d=>d.tabColumns[1].notes.length===1);
    await page.getByLabel(/^TIME SIGNATURE/).selectOption('6/8');
    const afterMeter=await draftWith(page,d=>d.timeSignature==='6/8');
    assert.deepEqual(afterMeter.tabColumns,explicitNotes.tabColumns);
    await page.getByLabel('String 6 column 1',{exact:true}).click();
    await reachable(page,page.getByLabel(/^Length/),viewport.width);
    await page.getByLabel(/^Length/).selectOption('1/8');
    assert.equal(await page.getByLabel('String 6 column 3',{exact:true}).inputValue(),'5');
    await page.getByLabel(/^Length/).selectOption('1/4');
    assert.equal(await page.getByLabel('String 6 column 2',{exact:true}).inputValue(),'5');
    await page.getByLabel(/^Length/).selectOption('1/2');
    assert.match(await page.getByRole('alert').filter({hasText:'Duration conflicts'}).innerText(),/conflicts/);
    assert.equal(await page.getByLabel(/^Length/).inputValue(),'1/4');
    await page.getByRole('button',{name:'Keep current events',exact:true}).click();
    await reachable(page,page.getByRole('button',{name:'Grace / passing note',exact:true}),viewport.width);
    await page.getByRole('button',{name:'Grace / passing note',exact:true}).click();
    await page.getByLabel(/^Technique/).selectOption('h');
    await reachable(page,page.getByRole('button',{name:'Add measure',exact:true}),viewport.width);
    await page.getByRole('button',{name:'Add measure',exact:true}).click();
    assert.equal(await staff.locator('[data-compound-group]').count(),1);
    await page.getByRole('button',{name:'Add measure',exact:true}).click();
    await reachable(page,page.getByRole('button',{name:'Delete measure 3',exact:true}),viewport.width);
    await page.getByRole('button',{name:'Delete measure 3',exact:true}).click();
    // Exercise horizontal input, including a touch swipe in the mobile browser context.
    await staff.scrollIntoViewIfNeeded();
    await staff.evaluate(element=>element.scrollLeft=0);
    if(suffix==='mobile') {
      const box=await staff.boundingBox();
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture',{
        x:box.x+box.width*0.75,y:box.y+box.height/2,
        xDistance:-180,yDistance:0,speed:400,scrollSourceType:'touch',
      });
      await cdp.detach();
    } else {
      await staff.hover(); await page.mouse.wheel(500,0);
    }
    await page.waitForFunction(()=>document.querySelector('[aria-label="Scrollable tablature"]').scrollLeft>0);
    // Continue to the final event and check its caption, boundary and active controls.
    await staff.evaluate(element=>element.scrollLeft=element.scrollWidth);
    const last=staff.locator('[data-tab-event]').last();
    await last.scrollIntoViewIfNeeded();
    const scroll=await staff.evaluate(e=>({left:e.scrollLeft,width:e.clientWidth,total:e.scrollWidth}));
    assert.ok(scroll.left>0 && scroll.total>scroll.width,'TAB must scroll horizontally');
    const boundary=last.locator('[title]').first();
    assert.match(await boundary.innerText(),/eighth/);
    assert.equal(await last.getAttribute('data-barline'),'single');
    assert.ok(await last.evaluate(e=>parseFloat(getComputedStyle(e).borderRightWidth)>=2));
    const boundaryControl=last.getByRole('button',{name:'Barline after event 11',exact:true});
    await reachable(page,boundaryControl,viewport.width);
    const controlBox=await boundaryControl.boundingBox(); const regionBox=await staff.boundingBox();
    assert.ok(controlBox.x>=regionBox.x && controlBox.x+controlBox.width<=regionBox.x+regionBox.width,'Boundary control must fit inside the scroller');
    await last.getByLabel('String 6 column 11',{exact:true}).click();
    await reachable(page,page.getByLabel(/^Length/),viewport.width);
    await reachable(page,page.getByRole('button',{name:'Make explicit rest',exact:true}),viewport.width);
    await page.getByRole('button',{name:'Make explicit rest',exact:true}).click();
    await reachable(page,page.getByLabel(/^Technique/),viewport.width);
    await reachable(page,page.getByLabel(/^Bar after/),viewport.width);
    await page.getByLabel(/^Bar after/).selectOption('final');
    await staff.locator('xpath=..').screenshot({path:path.join(data,`measured-${suffix}-scrolled-staff.png`)});
    await page.getByPlaceholder('e.g. 6/8 Riff in Open D or Morning Noodle').fill(`Measured ${suffix} acceptance`);
    await page.getByRole('button',{name:'Save to Motif Inbox',exact:true}).click();
    const beforeReload=await draftWith(page,d=>d.tabColumns.length===11&&d.tabColumns[10].barlineAfter==='final'&&!d.tabColumns[10].autoRest);
    assert.ok(beforeReload.tabColumns.every(e=>e.kind==='grace'||e.rest||e.notes.length>0));
    await page.reload(); await staff.locator('[data-measure-start]').first().waitFor();
    assert.equal(await staff.locator('[data-measure-start]').count(),2);
    assert.equal(await page.getByLabel('String 6 column 1',{exact:true}).inputValue(),'3');
    const afterReload=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),draftKey);
    assert.deepEqual(afterReload.tabColumns,beforeReload.tabColumns);
    if(suffix==='mobile') assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page controls must fit the viewport; only TAB scrolls horizontally');
    await page.screenshot({path:path.join(data,`measured-${suffix}-composer.png`),fullPage:true});
    const savedResponse=page.waitForResponse(r=>r.url()===base+'/api/quick-capture'&&r.status()===201);
    await page.getByRole('button',{name:'SAVE TO INBOX',exact:true}).click();
    const saved=await (await savedResponse).json();
    const columns=JSON.parse(saved.motif.tabData);
    assert.deepEqual(columns,beforeReload.tabColumns);
    await page.goto(base+'/print/motif/'+saved.motif.id);
    assert.match(await page.locator('body').innerText(),/Measure 1 · 4\/4 · Complete/);
    assert.match(await page.locator('body').innerText(),/Measure 2 · 6\/8 · Complete/);
    await page.pdf({path:path.join(data,`measured-${suffix}-motif.pdf`),format:'Letter',printBackground:true});
    await page.screenshot({path:path.join(data,`measured-${suffix}-print.png`),fullPage:true});
    // A stored free-rhythm draft must win over the fresh default, even with a numeric meter.
    const legacy={...beforeReload,tabColumns:[{id:'legacy-free',notes:[{stringIndex:0,fret:7}],duration:'1/8',barlineAfter:'double'}],timeSignature:'6/8',saveUncertain:false,activeColumnIndex:0};
    delete legacy.captureId;
    await page.evaluate(({key,draft})=>localStorage.setItem(key,JSON.stringify(draft)),{key:draftKey,draft:legacy});
    await page.goto(base+'/quick-capture'); await page.getByLabel('Rhythm mode',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Rhythm mode',{exact:true}).inputValue(),'free');
    assert.equal(await staff.locator('[data-measure-start]').count(),0);
    await page.getByLabel(/^TIME SIGNATURE/).selectOption('3/4');
    const retained=await draftWith(page,d=>d.timeSignature==='3/4');
    assert.deepEqual(retained.tabColumns,legacy.tabColumns);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`Measured ${suffix} acceptance PASS (${viewport.width}×${viewport.height})`);
  }
}
