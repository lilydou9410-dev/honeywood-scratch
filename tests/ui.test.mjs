import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {normalizeCode,validCode,csvCell,coverage} from '../src/utils.js';
await test('Phase 2: production entry is Japanese, uses reference, never advertises pool size',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/lang="ja"/);
 const jsx=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');const customer=jsx.split('function Customer()')[1].split('function Admin()')[0];assert.match(customer,/honeywood.jpeg/);assert(!/300[枚张份]/.test(customer));
 assert(validCode(normalizeCode(' hw-'+'a'.repeat(32)+' ')));assert(!validCode('HW-123'));
});
await test('Phase 3: erased pixel threshold measures alpha, not mouse distance',()=>{
 const data=new Uint8ClampedArray(640);for(let i=3;i<data.length;i+=4)data[i]=255;
 assert.equal(coverage({getImageData:()=>({data})},10,16),0);
 for(let i=3;i<data.length;i+=4)data[i]=0;
 assert.equal(coverage({getImageData:()=>({data})},10,16),1);
});
await test('Phase 5: CSV escapes formulas and quotes for Japanese Excel',()=>{
 assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(csvCell('猫,"蜜"'),'"猫,""蜜"""');
});
