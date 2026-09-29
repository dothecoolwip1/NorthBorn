import { useEffect, useRef } from 'react'
import './form-signature-pad.css'

export default function FormSignaturePad({value,onChange,label='Sign here'}:{value:string;onChange:(value:string)=>void;label?:string}){
 const canvasRef=useRef<HTMLCanvasElement|null>(null),drawing=useRef(false)
 const point=(event:React.PointerEvent<HTMLCanvasElement>)=>{const canvas=canvasRef.current!;const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*(canvas.width/rect.width),y:(event.clientY-rect.top)*(canvas.height/rect.height)}}
 const start=(event:React.PointerEvent<HTMLCanvasElement>)=>{const canvas=canvasRef.current!;canvas.setPointerCapture(event.pointerId);const ctx=canvas.getContext('2d')!;const p=point(event);ctx.beginPath();ctx.moveTo(p.x,p.y);drawing.current=true}
 const move=(event:React.PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const ctx=canvasRef.current!.getContext('2d')!;const p=point(event);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#101820';ctx.lineTo(p.x,p.y);ctx.stroke()}
 const finish=()=>{if(!drawing.current)return;drawing.current=false;onChange(canvasRef.current!.toDataURL('image/png'))}
 const clear=()=>{const canvas=canvasRef.current!;canvas.getContext('2d')!.clearRect(0,0,canvas.width,canvas.height);onChange('')}
 useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext('2d');ctx?.clearRect(0,0,canvas.width,canvas.height);if(!value)return;const image=new Image();image.onload=()=>{const current=canvasRef.current;if(current)current.getContext('2d')?.drawImage(image,0,0,current.width,current.height)};image.src=value},[value])
 return <div className="form-signature-pad"><div><canvas ref={canvasRef} width={800} height={220} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/><span>{label}</span></div><button type="button" onClick={clear}>Clear signature</button></div>
}
