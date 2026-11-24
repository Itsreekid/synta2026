
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('notification presentation simplifies old reschedules and selects trusted icons',async()=>{
 const source=await readFile(new URL('../public/js/user.js',import.meta.url),'utf8');
 const helper=source.slice(source.indexOf('function notificationPresentation('),source.indexOf('// Load notifications into dropdown'));
 const context=vm.createContext({});vm.runInContext(helper,context);
 const present=notification=>context.notificationPresentation(notification);
 const old='La séance « Cours Matrice », initialement prévue le mercredi 25 novembre 2026 à 08:00, est reportée au mercredi 25 novembre 2026 à 20:00 (heure de Tunis).';
 const result=present({title:'Séance reportée',message:old,type:'info'});
 assert.equal(result.message,'La séance « Cours Matrice » est reportée au mercredi 25 novembre 2026 à 20:00.');
 assert.equal(result.kind,'session');assert.match(result.icon,/<svg/);
 for(const [title,kind]of [['Paiement confirmé','payment'],['Abonnement expire bientôt','warning'],['Opération validée','success'],['Information','info']])assert.equal(present({title}).kind,kind);
 const unsafe=present({title:'<img src=x>',message:'<b>text</b> (Tunis)',type:'<script>'});
 assert.equal(unsafe.message,'<b>text</b>');assert.ok(!unsafe.icon.includes('<script>'));assert.ok(!unsafe.icon.includes('<img'));
 assert.ok(source.includes("querySelector('[data-notification-message]').textContent"));
 const css=await readFile(new URL('../public/css/user.css',import.meta.url),'utf8');
 assert.match(css,/#notificationDropdown \.notification-message/);assert.match(css,/@media\(max-width:480px\)/);
});
