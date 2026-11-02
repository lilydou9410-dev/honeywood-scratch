import React,{useEffect,useRef,useState} from 'react';
import {coverage} from './utils';
const date=x=>new Date(x).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
export default function Scratch({result}){
 const canvas=useRef(null),down=useRef(false),last=useRef(null),sampled=useRef(0),[revealed,setRevealed]=useState(false),[copied,setCopied]=useState(false);
 useEffect(()=>{setRevealed(false);const c=canvas.current,ctx=c.getContext('2d');ctx.globalCompositeOperation='source-over';const g=ctx.createLinearGradient(0,0,640,320);g.addColorStop(0,'#c8c6c2');g.addColorStop(.45,'#f8f4ee');g.addColorStop(1,'#aaa9aa');ctx.fillStyle=g;ctx.fillRect(0,0,640,320);ctx.fillStyle='#776c68';ctx.textAlign='center';ctx.font='bold 30px sans-serif';ctx.fillText('指でこすって、めくってね',320,145);ctx.font='20px sans-serif';ctx.fillText('✧ Honeywood Scratch ✧',320,190);},[result.coupon]);
 function point(e){const c=canvas.current,r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*640/r.width,y:(e.clientY-r.top)*320/r.height};}
 function move(e){if(!down.current||revealed)return;const p=point(e),ctx=canvas.current.getContext('2d');ctx.globalCompositeOperation='destination-out';ctx.lineWidth=52;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(last.current?.x??p.x,last.current?.y??p.y);ctx.lineTo(p.x,p.y);ctx.stroke();last.current=p;if(performance.now()-sampled.current>120){sampled.current=performance.now();if(coverage(ctx,640,320)>.4){down.current=false;setRevealed(true)}}}
 function stop(){if(!down.current)return;down.current=false;last.current=null;if(coverage(canvas.current.getContext('2d'),640,320)>.4)setRevealed(true);}
 return <section className={'result amount-'+result.amount+' '+(revealed?'revealed ':'')+(result.amount===300?'grand':'')}>
 <div className="eyebrow">あなただけの、甘い贈りもの</div><h2>{revealed?'おめでとうございます！':'わくわくを、ひと削り。'}</h2>
 <div className="scratch"><div className="prize" aria-hidden={!revealed}><span>Honeywood Coupon</span><strong>¥{result.amount}<small> OFF</small></strong><span>いつものお買いものに、小さな幸せを。</span></div><canvas ref={canvas} width="640" height="320" style={{visibility:revealed?'hidden':'visible'}} onPointerDown={e=>{down.current=true;last.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);move(e)}} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} aria-label="指やマウスで銀色の部分をこすってください"/></div>
 {!revealed?<><p className="hint">銀色の部分をこすると、クーポンが現れます。</p><button className="text-button" onClick={()=>setRevealed(true)}>こすらずに結果を見る</button></>:<div className="coupon-details" aria-live="polite"><span className="badge">{result.redeemed?'使用済み':'あなた専用のクーポン'}</span><p>ご注文の際に、こちらのコードをお知らせください。</p><code>{result.coupon}</code><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(result.coupon);setCopied(true)}catch{setCopied(false)}}}>{copied?'コピーしました ✓':'コードをコピー'}</button><p className="hint">スクリーンショットでも保存できます。<br/>参加コードを再入力すると、同じ結果を確認できます。</p><p className="hint">抽選日時：{date(result.drawn_at)}</p></div>}
 {revealed&&<div className="sparkles" aria-hidden="true">{Array.from({length:12},(_,i)=><span key={i} style={{'--i':i}}>✦</span>)}</div>}
 </section>;
}
