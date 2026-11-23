import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setPublicAssetCache } from '../utils/homepageDelivery.js';

test('pinned Video.js production imports resolve locally and versioned assets cache independently of private media', async () => {
    const base=new URL('../public/vendor/videojs/10.6.0/',import.meta.url);
    const provenance=JSON.parse(await readFile(new URL('PROVENANCE.json',base),'utf8'));
    assert.equal(provenance.version,'10.6.0');
    const seen=new Set();
    async function inspect(url) {
        if(seen.has(url.href))return;seen.add(url.href);
        const source=await readFile(url,'utf8');
        for(const match of source.matchAll(/(?:from\s*|import\s*\(?)['"](\.[^'"]+\.js)['"]/g)) {
            const dependency=new URL(match[1],url);
            assert.ok(dependency.href.startsWith(base.href),'imports must stay in pinned vendor directory');
            await inspect(dependency);
        }
    }
    await inspect(new URL('video.js',base));await inspect(new URL('locales/fr.js',base));await inspect(new URL('orientation-support.js',base));
    assert.ok(seen.size>30,'inspect complete shared module graph');
    await access(new URL('LICENSE',base));
    let cache;
    const res={req:{query:{}},setHeader:(_name,value)=>{cache=value;}};
    setPublicAssetCache(res,fileURLToPath(new URL('video.js',base)));
    assert.equal(cache,'public, max-age=31536000, immutable');
    cache=null;
    setPublicAssetCache(res,'/private/lesson.mp4');assert.equal(cache,null);
});

test('official orientation controller releases a late lock after exit and ignores unsupported APIs', async () => {
    const {createScreenOrientationLock}=await import('../public/vendor/videojs/10.6.0/orientation-support.js');
    const previous=Object.getOwnPropertyDescriptor(globalThis,'screen');
    let resolve,unlocks=0;
    Object.defineProperty(globalThis,'screen',{configurable:true,value:{orientation:{lock:()=>new Promise(done=>resolve=done),unlock:()=>unlocks++}}});
    try {
        const controller=createScreenOrientationLock();const pending=controller.lock('landscape');controller.unlock();resolve();await pending;
        assert.equal(unlocks,1,'late browser response must not leave orientation locked');
        globalThis.screen.orientation={};await controller.lock('landscape');controller.unlock();
    } finally {if(previous)Object.defineProperty(globalThis,'screen',previous);else delete globalThis.screen;}
});
