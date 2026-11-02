export const normalizeCode=x=>x.trim().toUpperCase();
export const validCode=x=>/^HW-[A-F0-9]{32}$/.test(x);
export const csvCell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
export function downloadCSV(rows,name){const content='\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function coverage(ctx,width,height){const pixels=ctx.getImageData(0,0,width,height).data;let erased=0,total=0;for(let i=3;i<pixels.length;i+=64){total++;if(pixels[i]<100)erased++;}return erased/total;}
