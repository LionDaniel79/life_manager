import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await expect(page.locator('nav .nav-button')).toHaveCount(5);
  await nav(page,'budget');await newGoal(page,'장기 연구','long','','2');await newGoal(page,'중기 연구','medium','장기 연구');await newGoal(page,'단기 독서','short','중기 연구');
  await expect(page.locator('#daily-budget-form')).toBeVisible();await page.locator('#daily-budget-form input[name="reading"]').fill('1.5');await page.locator('#daily-budget-form button[type="submit"]').click();
  await nav(page,'dashboard');await expect(page.locator('#life-home')).toContainText('50%');
  const middle=page.locator('#life-home .life-goal').filter({has:page.locator('strong').filter({hasText:'중기 연구'})});await expect(middle.locator('progress')).toHaveCount(0);await expect(page.locator('#dashboard-view')).toContainText('75점');
  await nav(page,'record');await expect(page.locator('#history-view')).toBeVisible();await page.locator('#manual-duration').fill('30');await page.getByRole('button',{name:'기록 저장',exact:true}).click();
  await nav(page,'dashboard');await expect(page.locator('#life-home')).toContainText('75%');
  await nav(page,'statistics');for(const mode of ['weekly','monthly','yearly','monthly-comparison','yearly-comparison']){await page.locator(`button[data-statistics-mode="${mode}"]`).click();await expect(page.locator('[data-statistics-feature]')).toHaveAttribute('data-statistics-mode',mode);}await expect(page.locator('#life-statistics')).toContainText('75%');
  await page.locator('[data-life="weight"]').click();await page.locator('#life-dialog [name="kg"]').fill('73.4');await page.locator('#life-dialog button[type="submit"]').click();await expect(page.locator('#life-statistics')).toContainText('73.4 kg');
  await page.reload();await expect(page.locator('#life-home')).toContainText('장기 연구');expect(errors).toEqual([]);
});
test('mobile layout, account isolation, and offline goal editing protection',async({page})=>{
  await open(page,390);await nav(page,'budget');await newGoal(page,'작은 목표','long');await expect(page.locator('#life-goals')).toContainText('작은 목표');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{__lifeHarness.failLoad=true;window.dispatchEvent(new Event('online'));});await expect(page.locator('.life-sync')).toContainText('불러오지 못했습니다');await expect(page.locator('[data-life="new"]')).toBeDisabled();
  await page.evaluate(()=>__lifeHarness.switchUser('different'));await expect(page.locator('#life-goals')).not.toContainText('작은 목표');
});
