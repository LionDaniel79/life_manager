import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({ timezoneId: 'Asia/Seoul' });
const original=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const html=original.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="/tests/browser/fixtures/life-harness.js"></script></body>');
async function open(page,width=1200){await page.setViewportSize({width,height:900});await page.route('**/life-test',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('/life-test');await expect(page.locator('.life-sync')).toContainText('동기화 완료');}
async function nav(page,view){if(await page.locator('#mobile-menu').isVisible())await page.locator('#mobile-menu').click();await page.locator(`nav [data-view="${view}"]`).click();}
async function newGoal(page,title,level,parent='',hours=''){
  await page.locator('[data-life="new"]').click();const d=page.locator('#life-dialog');await d.locator('[name="title"]').fill(title);await d.locator('[name="level"]').selectOption(level);
  if(parent)await d.locator('[name="parentId"]').selectOption({label:parent});
  if(hours)await d.locator('[name="hours"]').fill(hours);
  if(level==='short')await d.locator('[name="categoryIds"][value="reading"]').check();
  await d.locator('[name="confirmLinks"]').check();await d.locator('[name="confirmRetroactive"]').check();await d.locator('[name="showHome"]').check();await d.getByRole('button',{name:'저장',exact:true}).click();await expect(d).not.toBeVisible();
}
test('hierarchy, original manual recording, budgets, scores and five statistics modes work together',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await expect(page.locator('nav .nav-button')).toHaveCount(6);
  await nav(page,'goals');await newGoal(page,'장기 연구','long','','2');await newGoal(page,'중기 연구','medium','장기 연구');await newGoal(page,'단기 독서','short','중기 연구');
  await nav(page,'budget');await expect(page.locator('#page-title')).toHaveText('시간예산');await expect(page.locator('#daily-budget-form')).toBeVisible();await page.locator('#daily-budget-form input[name="reading"]').fill('1.5');await page.locator('#daily-budget-form button[type="submit"]').click();
  await nav(page,'dashboard');await expect(page.locator('#life-home')).toContainText('50%');
  const middle=page.locator('#life-home .life-goal').filter({has:page.locator('strong').filter({hasText:'중기 연구'})});await expect(middle.locator('progress')).toHaveCount(0);await expect(page.locator('#dashboard-view')).toContainText('75점');
  await nav(page,'record');await expect(page.locator('#history-view')).toBeVisible();await page.locator('#manual-duration').fill('30');await page.getByRole('button',{name:'기록 저장',exact:true}).click();
  await nav(page,'dashboard');await expect(page.locator('#life-home')).toContainText('75%');
  await nav(page,'statistics');for(const mode of ['weekly','monthly','yearly','monthly-comparison','yearly-comparison']){await page.locator(`button[data-statistics-mode="${mode}"]`).click();await expect(page.locator('[data-statistics-feature]')).toHaveAttribute('data-statistics-mode',mode);}await expect(page.locator('#life-statistics')).not.toBeVisible();await page.getByRole('button',{name:'목표통계',exact:true}).click();await expect(page.locator('#life-statistics')).toBeVisible();await expect(page.locator('#life-statistics')).toContainText('75%');
  await expect(page.locator('[data-life="weight"], [data-life="review"]')).toHaveCount(0);
  await page.reload();await expect(page.locator('#life-home')).toContainText('장기 연구');expect(errors).toEqual([]);
});
test('mobile layout, account isolation, and offline goal editing protection',async({page})=>{
  await open(page,390);await nav(page,'goals');await newGoal(page,'작은 목표','long');await expect(page.locator('#life-goals')).toContainText('작은 목표');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{__lifeHarness.failLoad=true;window.dispatchEvent(new Event('online'));});await expect(page.locator('.life-sync')).toContainText('불러오지 못했습니다');await expect(page.locator('[data-life="new"]')).toBeDisabled();
  await page.evaluate(()=>__lifeHarness.switchUser('different'));await expect(page.locator('#life-goals')).not.toContainText('작은 목표');
});
test('real index loads one mobile menu handler, including its production module URLs',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/src/service-worker-registration.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto('/index.html');await page.waitForFunction(()=>document.querySelector('#life-dialog'));
  await page.evaluate(()=>{document.querySelector('#login-view').classList.add('hidden');document.querySelector('#app-view').classList.remove('hidden');});
  await page.locator('#mobile-menu').click();await expect(page.locator('.sidebar')).toHaveClass(/open/);
  await page.locator('nav [data-view="goals"]').click();await expect(page.locator('#life-goals')).toBeVisible();
});
test('a delayed goal refresh blocks writes until it completes and cannot roll back confirmed edits',async({page})=>{
  await open(page);await nav(page,'goals');await newGoal(page,'갱신 확인','long');
  await page.evaluate(()=>{__lifeHarness.deferLoad=true;window.dispatchEvent(new Event('online'));});
  await page.waitForFunction(()=>__lifeHarness.pendingLoads?.length===1);
  await expect(page.locator('#life-goals [data-life="home.toggle"]')).toBeDisabled();
  await page.evaluate(()=>{__lifeHarness.deferLoad=false;__lifeHarness.pendingLoads.shift()();});
  await expect(page.locator('#life-goals [data-life="home.toggle"]')).toBeEnabled();
  await page.locator('#life-goals [data-life="home.toggle"]').click();
  await expect(page.locator('#life-goals [data-life="home.toggle"]')).toHaveText('대시보드에 표시');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('life-manager-goals:fixture')).revision)).toBe(2);
});

test('medium goal can link activities and a child together, assign once and reload',async({page})=>{
  await open(page,390);await nav(page,'goals');
  await newGoal(page,'장기 성장','long','','2');
  await newGoal(page,'중기 성장','medium','장기 성장','2');
  await newGoal(page,'단기 독서','short','중기 성장');
  const card=page.locator('#life-goals .life-goal').filter({has:page.locator('strong').filter({hasText:'중기 성장'})});
  await card.locator('[data-life="edit"]').click();
  const dialog=page.locator('#life-dialog');
  await dialog.getByLabel('독서',{exact:true}).check();
  await dialog.getByLabel('단기 독서',{exact:true}).check();
  await dialog.locator('[name="confirmLinks"]').check();
  await dialog.locator('[name="confirmRetroactive"]').check();
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await nav(page,'record');
  await page.getByText('목표별 시간 배정 · 1건 선택 필요',{exact:true}).click();
  const assignment=page.locator('[data-life-assignment="e1"]');
  await expect(assignment.locator('option')).toHaveCount(3);
  await assignment.selectOption({label:'단기 · 단기 독서'});
  await nav(page,'dashboard');
  for(const title of ['장기 성장','중기 성장']){
    const goal=page.locator('#life-home .life-goal').filter({has:page.locator('strong').filter({hasText:title})});
    await expect(goal).toContainText('50%');
  }
  await nav(page,'record');
  await page.getByText('목표별 시간 배정 · 0건 선택 필요',{exact:true}).click();
  await assignment.selectOption({label:'중기 · 중기 성장'});
  await page.reload();await expect(page.locator('.life-sync')).toContainText('동기화 완료');
  await nav(page,'dashboard');
  const child=page.locator('#life-home .life-goal').filter({has:page.locator('strong').filter({hasText:'단기 독서'})});
  await expect(child.locator('b')).toHaveText('0분');
  const parent=page.locator('#life-home .life-goal').filter({has:page.locator('strong').filter({hasText:'중기 성장'})});
  await expect(parent).toContainText('50%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('numeric medium goal measures weight, archives, restores and deletes across menus and reload',async({page})=>{
  await open(page,390);await nav(page,'goals');
  await page.locator('[data-life="new"]').click();
  const d=page.locator('#life-dialog');
  await d.locator('[name="title"]').fill('체중 조절');
  await d.locator('[name="level"]').selectOption('medium');
  await d.locator('[name="resultStart"]').fill('80');
  await d.locator('[name="resultTarget"]').fill('70');
  await d.locator('[name="resultUnit"]').fill('kg');
  await d.locator('[name="showHome"]').check();
  await d.locator('[name="confirmRetroactive"]').check();
  await d.getByRole('button',{name:'저장',exact:true}).click();
  await expect(d).not.toBeVisible();
  await nav(page,'dashboard');
  const card=page.locator('#life-home .life-goal').filter({hasText:'체중 조절'});
  await expect(card).toContainText('미측정');
  await card.getByRole('button',{name:'현재값 기록',exact:true}).click();
  await d.getByLabel('현재값 (kg)',{exact:true}).fill('75');
  await d.getByRole('button',{name:'저장',exact:true}).click();
  await expect(card).toContainText('75 kg');
  await expect(card).toContainText('50%');
  await expect(card.getByRole('progressbar')).toHaveAttribute('value','50');
  await page.reload();await expect(page.locator('.life-sync')).toContainText('동기화 완료');
  await expect(card).toContainText('75 kg');
  await nav(page,'statistics');await page.getByRole('button',{name:'목표통계',exact:true}).click();
  await expect(page.locator('#life-statistics')).toContainText('50%');
  await expect(page.getByRole('button',{name:'체중 기록',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'점검 기록',exact:true})).toHaveCount(0);
  await nav(page,'goals');
  const goal=page.locator('#life-goals .life-goal').filter({hasText:'체중 조절'});
  await goal.getByRole('button',{name:'상세',exact:true}).click();
  await d.getByRole('button',{name:'보관',exact:true}).click();
  await expect(d).not.toBeVisible();await expect(goal).not.toBeVisible();
  await nav(page,'dashboard');await expect(card).toHaveCount(0);
  await nav(page,'statistics');await expect(page.locator('#life-statistics')).not.toContainText('체중 조절');
  await nav(page,'goals');await page.getByText('보관 목표 · 1개',{exact:true}).click();
  await expect(goal).toBeVisible();
  await goal.getByRole('button',{name:'보관 해제·수정',exact:true}).click();
  await expect(d.locator('[name="status"]')).toHaveValue('active');
  await d.locator('[name="confirmRetroactive"]').check();
  await d.getByRole('button',{name:'저장',exact:true}).click();
  await expect(page.getByText('보관 목표 · 0개',{exact:true})).toBeVisible();
  await expect(goal).toBeVisible();
  await goal.getByRole('button',{name:'상세',exact:true}).click();
  page.once('dialog',dialog=>dialog.dismiss());
  await d.getByRole('button',{name:'목표 삭제',exact:true}).click();
  await expect(d).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await d.getByRole('button',{name:'목표 삭제',exact:true}).click();
  await expect(d).not.toBeVisible();await expect(goal).toHaveCount(0);
  await page.reload();await nav(page,'goals');await expect(goal).toHaveCount(0);
  expect(await page.evaluate(()=>__lifeHarness.entries.length)).toBe(3);
});

test('archiving preserves today’s parent total and allows correcting the retained assignment',async({page})=>{
  await open(page,390);
  await page.evaluate(async()=>{
    const {hydrateLife,applyLife,persistLife}=await import('/src/life/model.js');
    const {date,entries}=__lifeHarness;
    let s=hydrateLife(null,{entries,categories:[{id:'reading',name:'독서'}]},date);
    const add=extra=>{s=applyLife(s,{type:'goal.save',startDate:date,effectiveDate:date,showHome:true,...extra},date);};
    add({id:'l',level:'long',title:'누적 상위',targetMinutes:120});
    for(const id of ['a','b','c'])add({id,level:'medium',title:`중기 ${id}`,parentId:id==='a'?'l':'',categoryIds:['reading']});
    s=applyLife(s,{type:'assignment.save',entryId:'e1',goalId:'a'},date);
    localStorage.setItem('life-test-state',JSON.stringify(persistLife(s)));
  });
  await page.reload();await expect(page.locator('.life-sync')).toContainText('동기화 완료');
  await nav(page,'goals');await page.locator('#life-goals [data-goal-id="a"] [data-life="detail"]').click();
  await page.locator('#life-dialog').getByRole('button',{name:'보관',exact:true}).click();
  await expect(page.locator('#life-dialog')).not.toBeVisible();
  await nav(page,'dashboard');await expect(page.locator('#life-home [data-goal-id="l"]')).toContainText('50%');
  await nav(page,'record');await page.getByText('목표별 시간 배정 · 0건 선택 필요',{exact:true}).click();
  const selector=page.locator('[data-life-assignment="e1"]');
  await expect(selector).toHaveValue('a');await expect(selector.locator('option:checked')).toContainText('기존 배정 보존');
  await selector.selectOption('b');
  await nav(page,'dashboard');await expect(page.locator('#life-home [data-goal-id="l"]')).toContainText('0분');
  await expect(page.locator('#life-home [data-goal-id="b"]')).toContainText('1시간');
  await page.reload();await expect(page.locator('.life-sync')).toContainText('동기화 완료');
  await nav(page,'record');await page.getByText('목표별 시간 배정 · 0건 선택 필요',{exact:true}).click();
  await expect(selector).toHaveValue('b');await selector.selectOption('');
  await nav(page,'dashboard');await expect(page.locator('#life-home [data-goal-id="b"]')).toContainText('0분');
  expect(await page.evaluate(()=>__lifeHarness.entries.length)).toBe(3);
});
