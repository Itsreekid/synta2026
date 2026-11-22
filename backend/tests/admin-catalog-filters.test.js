import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('admin course/offer filters preserve targeting, actions and navigation on desktop/mobile', {
    skip: !process.env.TIMED_QA_CHROME, timeout: 60000,
}, async () => {
    const offer = (id, year, branch, active = true) => ({ id, title: id, target_classes: year ? [year] : [], target_branches: branch ? [branch] : [], is_active: active, fixed_price: '60.00', access_mode: 'monthly' });
    const offers = [offer('Troisième Info', '3eme', 'informatique'), offer('Deuxième Info', '2eme', 'informatique', false), offer('Bac Sciences', 'bac', 'sciences'), offer('Général <img src=x onerror=window.attacked=1>', '', ''), offer('Troisième Sciences', '3eme', 'sciences'), offer('Bac Info', 'bac', 'informatique')];
    offers[0].title = offers[1].title = 'معاك في الانفورماتيك';
    const course = (id, ids) => ({ id, title: id, offers_ids: ids, is_published: true, category: 'general', is_free: false, price: '60.00' });
    const courses = [course('Cours troisième', [offers[0].id]), course('Cours deuxième', [offers[1].id]), course('Cours libre', []), course('Cours croisé', [offers[4].id, offers[5].id]), course('Cours général', [offers[3].id]), course('Cours partagé', [offers[0].id, offers[1].id])];
    const app = express(); app.use(express.json());
    app.get('/js/authentication.js', (_req,res) => res.type('js').send('window.auth={};'));
    app.get('/admin/js/admin-auth.js', (_req,res) => res.type('js').send(''));
    app.get('/api/admin/offers', (_req,res) => res.json({ success:true, data:offers }));
    app.get('/api/admin/courses', (_req,res) => res.json({ success:true, data:courses }));
    let savedCopy;
    app.post('/api/admin/courses', (req,res) => { savedCopy = req.body; res.json({success:true}); });
    app.patch('/api/admin/offers/:id/status', (req,res) => { const item = offers.find(o=>o.id===req.params.id); item.is_active = req.body.is_active; res.json({success:true,is_active:item.is_active}); });
    for (const page of ['courses','offers']) app.get('/admin/pages/'+page+'.html', async (_req,res) => {
        const html = await readFile(new URL('../public/admin/pages/'+page+'.html',import.meta.url),'utf8');
        res.send(html.replace(/<script\b[^>]*src="https?:[^>]*><\/script>/g,'').replace(/<link\b[^>]*href="https?:[^>]*>/g,''));
    });
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
    try {
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors})=>{
            const set = (id,value) => evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
            const count = () => evaluate('document.querySelector(".catalog-result-count").textContent');
            for (const width of [1440,390,360]) {
                await open('/admin/pages/courses.html','synthetic',width);
                await until(()=>evaluate('!!window.courseCatalogFilter'),'course filters');
                await evaluate('document.querySelector(".catalog-reset").click()');
                assert.equal(await count(),'6 cours affichés sur 6');
                await set('catalog-year','3eme'); await set('catalog-branch','informatique');
                assert.equal(await count(),'4 cours affichés sur 6');
                assert.equal(await evaluate('Array.from(document.getElementById("catalog-offer").options).some(o=>o.value==="Deuxième Info")'),false,'offer choices follow the selected audience');
                assert.equal(await evaluate('document.getElementById("coursesBody").textContent.includes("Cours croisé")'),false,'year and branch must match the same offer');
                assert.equal(await evaluate('document.getElementById("coursesBody").textContent.includes("Tous les niveaux · Sans offre associée")'),true);
                await set('catalog-offer',offers[0].id);
                assert.equal(await count(),'2 cours affichés sur 6');
                await set('searchInput','troisième'); assert.equal(await count(),'1 cours affichés sur 6');
                await evaluate('document.querySelector("[data-edit-course]").click()');
                assert.equal(await evaluate('document.getElementById("courseId").value'),'Cours troisième');
                assert.match(await evaluate('document.querySelectorAll(".offer-option-meta")[0].textContent'),/3ème.*Informatique/s);
                assert.match(await evaluate('document.querySelectorAll(".offer-option-meta")[1].textContent'),/2ème.*Informatique/s);
                await evaluate('closeModal()');
                await evaluate('document.querySelector("[data-copy-course]").click()');
                assert.deepEqual(await evaluate('({id:document.getElementById("courseId").value,title:document.getElementById("title").value,published:document.getElementById("is_published").checked,offers:Array.from(document.querySelectorAll("#offers-list input:checked")).map(el=>el.value),note:!document.getElementById("course-copy-note").hidden})'),{id:'',title:'Cours troisième — Copie',published:false,offers:[offers[0].id],note:true});
                await evaluate('document.getElementById("courseForm").requestSubmit()');
                await until(()=>savedCopy?.title==='Cours troisième — Copie','copy save');
                assert.equal(savedCopy.id,null); assert.equal(savedCopy.is_published,false);
                assert.deepEqual(savedCopy.offers_ids,[offers[0].id]);
                assert.equal(courses[0].title,'Cours troisième');
                await until(()=>evaluate('document.getElementById("courseModal").style.display==="none"'),'copy form closed');
                savedCopy = null;
                await open('/admin/pages/offers.html','synthetic',width);
                await until(()=>evaluate('!!document.querySelector(".catalog-result-count")'),'offer filters');
                await evaluate('document.querySelector(".catalog-reset").click()');
                await set('catalog-selectedOffer',offers[1].id);
                assert.equal(await count(),'1 offres affichées sur 6');
                assert.match(await evaluate('document.getElementById("catalog-selectedOffer").selectedOptions[0].textContent'),/2ème.*Informatique/);
                await evaluate('document.querySelector(".catalog-reset").click()');
                await set('catalog-year','3eme'); await set('catalog-branch','informatique');
                assert.equal(await count(),'2 offres affichées sur 6');
                assert.equal(await evaluate('!!document.querySelector("#offersList img") || !!window.attacked'),false,'untrusted labels must stay text');
                await open('/admin/pages/courses.html','synthetic',width);
                await until(()=>evaluate('!!window.courseCatalogFilter'),'restored filters');
                assert.equal(await count(),'1 cours affichés sur 6');
                assert.equal(await evaluate('document.getElementById("searchInput").value'),'troisième');
                await evaluate('document.querySelector(".catalog-reset").click()');
                await set('catalog-offer','__unlinked'); assert.equal(await count(),'1 cours affichés sur 6');
                await set('searchInput','not found'); assert.equal(await count(),'0 cours affichés sur 6');
                assert.match(await evaluate('document.getElementById("coursesBody").textContent'),/Réinitialisez/);
                assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false,'page must fit viewport');
                await evaluate('document.querySelector(".catalog-reset").click()');
                await set('statusFilter','draft'); assert.equal(await count(),'0 cours affichés sur 6');
                await open('/admin/pages/offers.html','synthetic',width);
                await until(()=>evaluate('!!document.querySelector(".catalog-reset")'),'offers restored');
                await evaluate('document.querySelector(".catalog-reset").click()');
                await set('catalog-status','inactive');
                assert.equal(await count(),offers[1].is_active ? '0 offres affichées sur 6' : '1 offres affichées sur 6');
                if (!offers[1].is_active) {
                    await evaluate('document.querySelector(".offer-status-switch").click()');
                    await until(async()=>await count()==='0 offres affichées sur 6','status filter after activation');
                }
                await evaluate('document.querySelector(".catalog-reset").click()');
                assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false);
                assert.equal(await evaluate('document.querySelectorAll(".edit-btn").length'),6,'edit actions preserved');
            }
            assert.deepEqual(errors,[]);
        });
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
