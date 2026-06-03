import { useState, useEffect, useCallback } from "react";
import { saveToFirebase, subscribeToFirebase } from "./firebase.js";

const CITY_EMOJIS = {
  madrid:"🇪🇸",barcelona:"🇪🇸",paris:"🇫🇷",roma:"🇮🇹",
  santorini:"🇬🇷",mykonos:"🇬🇷",amsterdam:"🇳🇱",lisboa:"🇵🇹",
  berlin:"🇩🇪",viena:"🇦🇹",praga:"🇨🇿",londres:"🇬🇧",
  positano:"🇮🇹",amalfi:"🇮🇹","costa amalfitana":"🇮🇹",atenas:"🇬🇷",
};
const guessEmoji = (city) => {
  const k = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return CITY_EMOJIS[k] || "📍";
};

const CATEGORIES = {
  transport:{label:"Transporte",color:"#A78BFA"},
  hotel:{label:"Hospedaje",color:"#F472B6"},
  food:{label:"Comida",color:"#FB923C"},
  culture:{label:"Cultura",color:"#34D399"},
  leisure:{label:"Ocio",color:"#60A5FA"},
  shopping:{label:"Compras",color:"#FBBF24"},
};

const EMPTY_DATA = {
  configured:false,
  trip:{name:"Mi Eurotrip",travelers:["Lore","Cata"],budget:6500000,startDate:"2026-07-22",endDate:"2026-08-10"},
  destinations:[],days:[],expenses:[],reservations:[],
  packing:{
    "Documentos":[
      {item:"Pasaporte (vigente +6 meses)",checked:false},
      {item:"Seguro de viaje",checked:false},
      {item:"ETIAS (requerido 2026)",checked:false},
      {item:"Tarjeta sin comisión",checked:false},
      {item:"Efectivo €200 mínimo",checked:false},
      {item:"Reservaciones PDF",checked:false},
    ],
    "Ropa & Playa":[
      {item:"Trajes de baño x3",checked:false},
      {item:"Vestidos verano x5",checked:false},
      {item:"Pareos / kimonos",checked:false},
      {item:"Shorts y tops x4 c/u",checked:false},
      {item:"Outfit de noche",checked:false},
      {item:"Sneakers cómodos",checked:false},
      {item:"Sandalias de playa",checked:false},
      {item:"Sandalias de noche",checked:false},
      {item:"Lentes de sol",checked:false},
      {item:"Sombrero",checked:false},
    ],
    "Salud":[
      {item:"Protector solar SPF 50+",checked:false},
      {item:"After sun / aloe vera",checked:false},
      {item:"Pastillas para mareo",checked:false},
      {item:"Medicamentos personales",checked:false},
      {item:"Botiquín básico",checked:false},
    ],
    "Tecnología":[
      {item:"Adaptador europeo C/F",checked:false},
      {item:"Powerbank",checked:false},
      {item:"Audífonos",checked:false},
      {item:"Cámara / GoPro",checked:false},
      {item:"eSIM Europa (Airalo)",checked:false},
      {item:"Cables de carga",checked:false},
    ],
    "Higiene":[
      {item:"Shampoo + acondicionador",checked:false},
      {item:"Desodorante",checked:false},
      {item:"Crema facial",checked:false},
      {item:"Cepillo + pasta dental",checked:false},
      {item:"Perfume <100ml",checked:false},
    ],
    "Extras":[
      {item:"Bolsa de playa / tote",checked:false},
      {item:"Candado para maleta",checked:false},
      {item:"Snacks para vuelos",checked:false},
      {item:"Antifaz + tapones",checked:false},
      {item:"Mini mochila día",checked:false},
    ],
  },
};

const uid = () => Math.random().toString(36).slice(2,9);
const fmtCLP = (n) => "$" + Math.round(n||0).toLocaleString("es-CL");

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate()+n);
  return d.toISOString().split("T")[0];
}
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr+"T12:00:00");
    return d.toLocaleDateString("es-CL",{day:"numeric",month:"short"});
  } catch { return dateStr; }
}
function buildDaysFromDestinations(destinations, startDate) {
  const days = [];
  let cursor = startDate;
  const sorted = [...destinations].sort((a,b)=>a.order-b.order);
  sorted.forEach(dest => {
    for (let i=0; i<dest.nights; i++) {
      days.push({id:uid(),dayNum:days.length+1,date:cursor,destId:dest.id,city:dest.city,emoji:dest.emoji,activities:[]});
      cursor = addDays(cursor,1);
    }
  });
  return days;
}
function calcBalances(expenses, travelers) {
  const b = {};
  travelers.forEach(t => b[t]=0);
  expenses.forEach(e => {
    const share = e.amount/(e.split?.length||1);
    (e.split||[]).forEach(p => { if(p in b) b[p]-=share; });
    if(e.paidBy in b) b[e.paidBy]+=e.amount;
  });
  return b;
}
function calcSettlements(balances) {
  const cred=[],debt=[];
  Object.entries(balances).forEach(([p,v])=>{
    if(v>1) cred.push({p,v});
    else if(v<-1) debt.push({p,v:-v});
  });
  const out=[];
  let ci=0,di=0;
  while(ci<cred.length&&di<debt.length){
    const c=cred[ci],d=debt[di];
    const a=Math.min(c.v,d.v);
    out.push({from:d.p,to:c.p,amount:a});
    c.v-=a; d.v-=a;
    if(c.v<1) ci++;
    if(d.v<1) di++;
  }
  return out;
}

const C = {
  bg:"#FAFAF8",surface:"#FFFFFF",alt:"#F6F3EE",
  border:"#E8E3DA",borderLight:"#F0EDE8",
  text:"#1C1917",sub:"#78716C",mute:"#A8A29E",
  accent:"#C8956C",accentBg:"#FDF0E8",
  success:"#6B9E6B",successBg:"#EEF5EE",
  warn:"#C0893A",warnBg:"#FEF3E2",
  danger:"#BE6B6B",dangerBg:"#FEF0F0",
  blue:"#5B8DB8",blueBg:"#EEF4FB",
};
const base = {
  input:{background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 12px",fontSize:13.5,color:C.text,fontFamily:"inherit",width:"100%",boxSizing:"border-box",outline:"none"},
  btn:{background:C.text,color:C.bg,border:"none",borderRadius:10,padding:"11px 18px",fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  ghost:{background:"transparent",color:C.sub,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"9px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  label:{fontSize:10,fontWeight:700,color:C.mute,letterSpacing:1.3,textTransform:"uppercase",marginBottom:5,display:"block"},
  card:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16},
};

function Card({children,style,onClick}){
  return <div onClick={onClick} style={{...base.card,...style,cursor:onClick?"pointer":undefined}}>{children}</div>;
}
function Inp({label,value,onChange,type="text",placeholder,style}){
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={base.label}>{label}</label>}
      <input value={value??""} type={type} placeholder={placeholder} onChange={e=>onChange(e.target.value)} style={{...base.input,...style}}/>
    </div>
  );
}
function Sel({label,value,onChange,options}){
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={base.label}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)} style={base.input}>
        {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
      </select>
    </div>
  );
}
function Badge({children,color=C.accent}){
  return <span style={{background:color+"18",color,border:`1px solid ${color}30`,borderRadius:6,padding:"2px 8px",fontSize:10.5,fontWeight:600,display:"inline-block"}}>{children}</span>;
}
function Pill({children,active,onClick}){
  return <button onClick={onClick} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",background:active?C.text:C.alt,color:active?C.bg:C.sub,fontFamily:"inherit",fontSize:11.5,fontWeight:active?700:500,whiteSpace:"nowrap"}}>{children}</button>;
}
function Modal({open,onClose,title,children}){
  if(!open) return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}>{title}</h3>
          <button onClick={onClose} style={{background:C.alt,border:"none",width:30,height:30,borderRadius:15,cursor:"pointer",fontSize:18,color:C.sub}}> × </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function SetupWizard({onFinish}){
  const [step,setStep]=useState(0);
  const [trip,setTrip]=useState({name:"Eurotrip 2026",travelers:"Lore, Cata",budget:"6500000",startDate:"2026-07-22"});
  const [destinations,setDestinations]=useState([]);
  const [newCity,setNewCity]=useState({city:"",nights:"2"});
  const addDest=()=>{
    if(!newCity.city.trim()) return;
    setDestinations(d=>[...d,{id:uid(),city:newCity.city.trim(),nights:Math.max(1,parseInt(newCity.nights)||2),emoji:guessEmoji(newCity.city),order:d.length}]);
    setNewCity({city:"",nights:"2"});
  };
  const moveDest=(id,dir)=>{
    setDestinations(prev=>{
      const arr=[...prev].sort((a,b)=>a.order-b.order);
      const i=arr.findIndex(x=>x.id===id);
      const j=i+dir;
      if(j<0||j>=arr.length) return prev;
      [arr[i],arr[j]]=[arr[j],arr[i]];
      return arr.map((x,idx)=>({...x,order:idx}));
    });
  };
  const totalNights=destinations.reduce((s,d)=>s+d.nights,0);
  const finish=()=>{
    const travelers=trip.travelers.split(",").map(t=>t.trim()).filter(Boolean);
    const days=buildDaysFromDestinations(destinations,trip.startDate);
    const endDate=days.length?addDays(trip.startDate,totalNights-1):trip.startDate;
    onFinish({...EMPTY_DATA,configured:true,trip:{name:trip.name||"Mi Eurotrip",travelers,budget:parseInt(trip.budget)||6500000,startDate:trip.startDate,endDate},destinations,days});
  };
  const steps=[
    {title:"¡Hola! 🌍 Arma tu viaje",content:(
      <div>
        <p style={{color:C.sub,fontSize:13,margin:"0 0 20px"}}>Configura lo básico. Puedes editar todo después.</p>
        <Inp label="Nombre del viaje" value={trip.name} onChange={v=>setTrip({...trip,name:v})} placeholder="Eurotrip 2026"/>
        <Inp label="Viajeras (separadas por coma)" value={trip.travelers} onChange={v=>setTrip({...trip,travelers:v})} placeholder="Lore, Cata"/>
        <Inp label="Presupuesto total (CLP)" type="number" value={trip.budget} onChange={v=>setTrip({...trip,budget:v})}/>
        <Inp label="Fecha de inicio" type="date" value={trip.startDate} onChange={v=>setTrip({...trip,startDate:v})}/>
      </div>
    )},
    {title:"🗺️ Destinos y días",content:(
      <div>
        <p style={{color:C.sub,fontSize:13,margin:"0 0 14px"}}>Agrega cada ciudad y cuántas noches. Reordena con ▲▼</p>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input value={newCity.city} onChange={e=>setNewCity({...newCity,city:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addDest()} style={{...base.input,flex:1,marginBottom:0}} placeholder="Ciudad (ej. Santorini)"/>
          <input type="number" min="1" value={newCity.nights} onChange={e=>setNewCity({...newCity,nights:e.target.value})} style={{...base.input,width:60,marginBottom:0,textAlign:"center"}}/>
          <button onClick={addDest} style={{...base.btn,padding:"10px 14px"}}>+</button>
        </div>
        {destinations.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:C.mute,fontSize:13}}>Agrega tu primera ciudad ↑</div>}
        {[...destinations].sort((a,b)=>a.order-b.order).map((d,i,arr)=>(
          <Card key={d.id} style={{marginBottom:7,padding:"11px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <button disabled={i===0} onClick={()=>moveDest(d.id,-1)} style={{background:"none",border:"none",cursor:i===0?"default":"pointer",fontSize:10,color:i===0?C.mute:C.sub,padding:0}}>▲</button>
                <button disabled={i===arr.length-1} onClick={()=>moveDest(d.id,1)} style={{background:"none",border:"none",cursor:i===arr.length-1?"default":"pointer",fontSize:10,color:i===arr.length-1?C.mute:C.sub,padding:0}}>▼</button>
              </div>
              <span style={{fontSize:22}}>{d.emoji}</span>
              <div style={{flex:1,fontWeight:600,fontSize:14}}>{d.city}</div>
              <input type="number" min="1" value={d.nights} onChange={e=>setDestinations(prev=>prev.map(x=>x.id===d.id?{...x,nights:Math.max(1,parseInt(e.target.value)||1)}:x))} style={{...base.input,width:52,padding:"6px 8px",textAlign:"center",marginBottom:0,fontSize:13}}/>
              <button onClick={()=>setDestinations(prev=>prev.filter(x=>x.id!==d.id))} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:20,padding:"0 2px"}}>×</button>
            </div>
          </Card>
        ))}
        {totalNights>0&&<div style={{marginTop:10,padding:"10px 14px",background:C.accentBg,borderRadius:10,fontSize:12,color:C.accent,fontWeight:600}}>{totalNights} noches · {destinations.length} ciudades</div>}
      </div>
    )},
    {title:"✅ Todo listo",content:(
      <div>
        <Card style={{background:C.accentBg,border:"none",marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>{trip.name}</div>
          <div style={{color:C.sub,fontSize:12}}>{trip.travelers} · {totalNights} noches · Desde {trip.startDate}<br/>{fmtCLP(parseInt(trip.budget)||0)}</div>
        </Card>
        {[...destinations].sort((a,b)=>a.order-b.order).map((d,i)=>(
          <div key={d.id} style={{display:"flex",gap:10,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.borderLight}`}}>
            <span style={{color:C.mute,fontSize:11,width:18,textAlign:"right"}}>{i+1}</span>
            <span style={{fontSize:18}}>{d.emoji}</span>
            <span style={{fontWeight:600,flex:1,fontSize:13}}>{d.city}</span>
            <span style={{color:C.sub,fontSize:11}}>{d.nights} noches</span>
          </div>
        ))}
        <p style={{color:C.mute,fontSize:11,marginTop:14}}>💡 Sincronizado con Cata en tiempo real via Firebase.</p>
      </div>
    )},
  ];
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{display:"flex",gap:6,marginBottom:28}}>
          {steps.map((_,i)=><div key={i} style={{height:3,flex:1,borderRadius:2,background:i<=step?C.text:C.border}}/>)}
        </div>
        <h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:C.text}}>{steps[step].title}</h2>
        <div style={{marginBottom:24}}>{steps[step].content}</div>
        <div style={{display:"flex",gap:10}}>
          {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{...base.ghost,flex:1}}>← Atrás</button>}
          <button onClick={()=>step===steps.length-1?finish():setStep(s=>s+1)} disabled={step===1&&destinations.length===0} style={{...base.btn,flex:2,opacity:(step===1&&destinations.length===0)?0.4:1}}>
            {step===steps.length-1?"¡Empezar! 🚀":"Continuar →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({data,sync,onSettings}){
  const {trip}=data;
  const daysLeft=Math.ceil((new Date(trip.startDate+"T12:00:00")-new Date())/86400000);
  const totalNights=data.destinations.reduce((s,d)=>s+d.nights,0);
  return(
    <div style={{padding:"16px 16px 12px",background:C.surface,borderBottom:`1px solid ${C.border}`,flexShrink:0,position:"sticky",top:0,zIndex:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <h1 style={{margin:0,fontSize:19,fontWeight:700,letterSpacing:-0.4,color:C.text}}>✈️ {trip.name}</h1>
            <button onClick={onSettings} style={{background:"none",border:"none",cursor:"pointer",color:C.mute,fontSize:14,padding:"2px 4px"}}>⚙</button>
          </div>
          <p style={{margin:"3px 0 0",color:C.sub,fontSize:11}}>{trip.travelers.join(" & ")} · {totalNights} noches</p>
        </div>
        <div style={{background:C.accentBg,borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
          <div style={{color:C.accent,fontSize:21,fontWeight:700,lineHeight:1}}>{Math.max(0,daysLeft)}</div>
          <div style={{color:C.sub,fontSize:8,marginTop:2,letterSpacing:0.8}}>DÍAS</div>
        </div>
      </div>
      <div style={{display:"flex",gap:5,marginTop:10,alignItems:"center",flexWrap:"wrap"}}>
        <Badge color={C.accent}>{fmtCLP(trip.budget)}</Badge>
        <Badge color={C.blue}>{formatDate(trip.startDate)} → {formatDate(trip.endDate||trip.startDate)}</Badge>
        <span style={{marginLeft:"auto",fontSize:9,color:sync==="error"?C.danger:C.mute}}>
          {sync==="saving"?"↻ guardando...":sync==="error"?"⚠ sin conexión":"☁ sincronizado"}
        </span>
      </div>
    </div>
  );
}

function TabBar({active,onChange}){
  const tabs=[
    {id:"itinerary",l:"Días"},{id:"expenses",l:"Gastos"},
    {id:"flights",l:"Vuelos"},{id:"hotels",l:"Hoteles"},
    {id:"budget",l:"Presupuesto"},{id:"map",l:"Mapa"},{id:"packing",l:"Maleta"},
  ];
  return(
    <div style={{display:"flex",overflowX:"auto",padding:"0 8px",background:C.surface,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)} style={{padding:"12px 12px",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:active===t.id?700:500,color:active===t.id?C.text:C.mute,whiteSpace:"nowrap",borderBottom:active===t.id?`2px solid ${C.text}`:"2px solid transparent"}}>{t.l}</button>
      ))}
    </div>
  );
}

function SettingsModal({open,onClose,data,updateData}){
  const [trip,setTrip]=useState(data.trip);
  const [dests,setDests]=useState([...data.destinations].sort((a,b)=>a.order-b.order));
  const [newCity,setNewCity]=useState({city:"",nights:"2"});
  useEffect(()=>{if(open){setTrip(data.trip);setDests([...data.destinations].sort((a,b)=>a.order-b.order));}},[open]);
  const addDest=()=>{
    if(!newCity.city.trim()) return;
    setDests(d=>[...d,{id:uid(),city:newCity.city.trim(),nights:Math.max(1,parseInt(newCity.nights)||2),emoji:guessEmoji(newCity.city),order:d.length}]);
    setNewCity({city:"",nights:"2"});
  };
  const moveDest=(id,dir)=>{
    setDests(prev=>{
      const arr=[...prev];
      const i=arr.findIndex(x=>x.id===id);
      const j=i+dir;
      if(j<0||j>=arr.length) return prev;
      [arr[i],arr[j]]=[arr[j],arr[i]];
      return arr.map((x,idx)=>({...x,order:idx}));
    });
  };
  const save=()=>{
    const travelers=trip.travelers_str?trip.travelers_str.split(",").map(t=>t.trim()).filter(Boolean):trip.travelers;
    const newTrip={...trip,travelers};
    const newDests=dests.map((d,i)=>({...d,order:i}));
    const newDays=buildDaysFromDestinations(newDests,newTrip.startDate);
    const oldMap={};
    data.days.forEach(d=>{oldMap[`${d.city}-${d.dayNum}`]=d.activities;});
    newDays.forEach(d=>{const k=`${d.city}-${d.dayNum}`;if(oldMap[k])d.activities=oldMap[k];});
    updateData({...data,trip:newTrip,destinations:newDests,days:newDays});
    onClose();
  };
  return(
    <Modal open={open} onClose={onClose} title="⚙ Configurar viaje">
      <Inp label="Nombre del viaje" value={trip.name} onChange={v=>setTrip({...trip,name:v})}/>
      <Inp label="Viajeras (separar con coma)" value={trip.travelers_str??trip.travelers.join(", ")} onChange={v=>setTrip({...trip,travelers_str:v})}/>
      <Inp label="Presupuesto (CLP)" type="number" value={trip.budget} onChange={v=>setTrip({...trip,budget:parseInt(v)||0})}/>
      <Inp label="Fecha inicio" type="date" value={trip.startDate} onChange={v=>setTrip({...trip,startDate:v})}/>
      <div style={{borderTop:`1px solid ${C.border}`,margin:"14px 0"}}/>
      <label style={base.label}>Destinos y orden</label>
      <div style={{display:"flex",gap:7,marginBottom:10}}>
        <input value={newCity.city} onChange={e=>setNewCity({...newCity,city:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addDest()} style={{...base.input,flex:1,marginBottom:0}} placeholder="Nueva ciudad..."/>
        <input type="number" min="1" value={newCity.nights} onChange={e=>setNewCity({...newCity,nights:e.target.value})} style={{...base.input,width:56,marginBottom:0,textAlign:"center"}}/>
        <button onClick={addDest} style={{...base.btn,padding:"10px 14px"}}>+</button>
      </div>
      {dests.map((d,i)=>(
        <Card key={d.id} style={{marginBottom:6,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{display:"flex",flexDirection:"column"}}>
              <button onClick={()=>moveDest(d.id,-1)} disabled={i===0} style={{background:"none",border:"none",cursor:i===0?"default":"pointer",fontSize:10,color:i===0?C.mute:C.sub,padding:0}}>▲</button>
              <button onClick={()=>moveDest(d.id,1)} disabled={i===dests.length-1} style={{background:"none",border:"none",cursor:i===dests.length-1?"default":"pointer",fontSize:10,color:i===dests.length-1?C.mute:C.sub,padding:0}}>▼</button>
            </div>
            <span style={{fontSize:20}}>{d.emoji}</span>
            <div style={{flex:1}}>
              <input value={d.city} onChange={e=>setDests(prev=>prev.map(x=>x.id===d.id?{...x,city:e.target.value,emoji:guessEmoji(e.target.value)}:x))} style={{...base.input,marginBottom:0,padding:"5px 8px",fontSize:13,fontWeight:600}}/>
            </div>
            <input type="number" min="1" value={d.nights} onChange={e=>setDests(prev=>prev.map(x=>x.id===d.id?{...x,nights:Math.max(1,parseInt(e.target.value)||1)}:x))} style={{...base.input,width:52,marginBottom:0,padding:"5px 8px",textAlign:"center"}}/>
            <button onClick={()=>setDests(prev=>prev.filter(x=>x.id!==d.id))} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:20,padding:"0 4px"}}>×</button>
          </div>
        </Card>
      ))}
      <div style={{display:"flex",gap:8,marginTop:20}}>
        <button onClick={save} style={{...base.btn,flex:2}}>Guardar cambios</button>
        <button onClick={onClose} style={{...base.ghost,flex:1}}>Cancelar</button>
      </div>
    </Modal>
  );
}
function ItineraryTab({data,updateData}){
  const [selId,setSelId]=useState(data.days[0]?.id);
  const [editing,setEditing]=useState(null);
  const [adding,setAdding]=useState(false);
  const day=data.days.find(d=>d.id===selId)||data.days[0];
  const saveAct=(dayId,act)=>{
    updateData({...data,days:data.days.map(d=>{
      if(d.id!==dayId) return d;
      return{...d,activities:act.id?d.activities.map(a=>a.id===act.id?act:a):[...d.activities,{...act,id:uid()}]};
    })});
    setEditing(null);setAdding(false);
  };
  const delAct=(dayId,actId)=>{
    if(!confirm("¿Eliminar?")) return;
    updateData({...data,days:data.days.map(d=>d.id!==dayId?d:{...d,activities:d.activities.filter(a=>a.id!==actId)})});
    setEditing(null);
  };
  if(!data.days.length) return <div style={{padding:20,textAlign:"center",color:C.mute,fontSize:13}}>Sin días. Ve a ⚙ para agregar destinos.</div>;
  return(
    <div style={{display:"flex"}}>
      <div style={{width:70,flexShrink:0,borderRight:`1px solid ${C.border}`,paddingTop:8,minHeight:"60vh"}}>
        {data.days.map((d,i)=>(
          <div key={d.id} onClick={()=>setSelId(d.id)} style={{padding:"9px 4px",cursor:"pointer",textAlign:"center",background:selId===d.id?C.text:"transparent",color:selId===d.id?C.bg:C.text,borderRadius:8,margin:"0 4px 3px"}}>
            <div style={{fontSize:8,opacity:0.5}}>DÍA {i+1}</div>
            <div style={{fontSize:17,margin:"2px 0"}}>{d.emoji}</div>
            <div style={{fontSize:8,fontWeight:600,lineHeight:1.2}}>{d.city.split(" ")[0]}</div>
            <div style={{fontSize:7,opacity:0.5,marginTop:1}}>{formatDate(d.date)}</div>
          </div>
        ))}
      </div>
      <div style={{flex:1,padding:"14px 14px"}}>
        {day&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
            <div>
              <h2 style={{margin:0,fontSize:20,fontWeight:700,color:C.text}}>{day.city}</h2>
              <p style={{margin:"3px 0 0",color:C.sub,fontSize:11}}>{formatDate(day.date)}</p>
            </div>
            <button onClick={()=>setAdding(true)} style={{...base.btn,padding:"8px 14px",fontSize:11}}>+ Actividad</button>
          </div>
          {day.activities.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:C.mute,fontSize:12}}>Sin actividades. Toca + para agregar.</div>}
          {day.activities.map(a=>{
            const cat=CATEGORIES[a.type]||CATEGORIES.leisure;
            return(
              <Card key={a.id} style={{marginBottom:8,padding:"12px 14px"}} onClick={()=>setEditing({...a,dayId:day.id})}>
                <div style={{display:"flex",gap:12}}>
                  <div style={{minWidth:42,paddingTop:2}}><div style={{fontSize:11.5,fontWeight:700,color:C.text}}>{a.time||"—"}</div></div>
                  <div style={{width:3,background:cat.color,borderRadius:2,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                      <div style={{fontWeight:600,fontSize:13.5,color:C.text}}>{a.title}</div>
                      {a.cost>0&&<div style={{fontWeight:700,fontSize:12,color:C.text,flexShrink:0}}>{fmtCLP(a.cost)}</div>}
                    </div>
                    {a.notes&&<div style={{color:C.sub,fontSize:11,marginTop:3}}>{a.notes}</div>}
                    {a.transport&&<div style={{marginTop:5,display:"inline-flex",gap:4,alignItems:"center",background:C.alt,padding:"3px 8px",borderRadius:6}}><span style={{fontSize:10}}>⊙</span><span style={{fontSize:10.5,color:C.sub}}>{a.transport}</span></div>}
                  </div>
                </div>
              </Card>
            );
          })}
        </>}
      </div>
      <Modal open={!!editing||adding} onClose={()=>{setEditing(null);setAdding(false);}} title={editing?"Editar actividad":"Nueva actividad"}>
        <ActivityForm act={editing} onSave={act=>saveAct(editing?.dayId||day.id,act)} onDelete={editing?()=>delAct(editing.dayId,editing.id):null}/>
      </Modal>
    </div>
  );
}
function ActivityForm({act,onSave,onDelete}){
  const [f,setF]=useState(act||{time:"",title:"",type:"leisure",cost:0,notes:"",transport:""});
  return(
    <div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}><Inp label="Hora" value={f.time} onChange={v=>setF({...f,time:v})} placeholder="14:00"/></div>
        <div style={{flex:2}}><Sel label="Tipo" value={f.type} onChange={v=>setF({...f,type:v})} options={Object.entries(CATEGORIES).map(([k,v])=>({value:k,label:v.label}))}/></div>
      </div>
      <Inp label="Título" value={f.title} onChange={v=>setF({...f,title:v})} placeholder="Actividad..."/>
      <Inp label="Costo (CLP)" type="number" value={f.cost} onChange={v=>setF({...f,cost:Number(v)||0})}/>
      <Inp label="Notas" value={f.notes} onChange={v=>setF({...f,notes:v})} placeholder="Notas opcionales..."/>
      <Inp label="Transporte / Metro cercano" value={f.transport} onChange={v=>setF({...f,transport:v})} placeholder="Metro L2, Bus X..."/>
      <div style={{display:"flex",gap:8,marginTop:6}}>
        <button onClick={()=>onSave(f)} style={{...base.btn,flex:1}}>Guardar</button>
        {onDelete&&<button onClick={onDelete} style={{...base.ghost,color:C.danger,borderColor:C.danger+"40"}}>Eliminar</button>}
      </div>
    </div>
  );
}
function ExpensesTab({data,updateData}){
  const [view,setView]=useState("list");
  const [editing,setEditing]=useState(null);
  const [adding,setAdding]=useState(false);
  const balances=calcBalances(data.expenses,data.trip.travelers);
  const settlements=calcSettlements({...balances});
  const total=data.expenses.reduce((s,e)=>s+e.amount,0);
  const catTotals={};
  data.expenses.forEach(e=>{catTotals[e.category]=(catTotals[e.category]||0)+e.amount;});
  const save=(exp)=>{updateData({...data,expenses:exp.id?data.expenses.map(x=>x.id===exp.id?exp:x):[...data.expenses,{...exp,id:uid()}]});setEditing(null);setAdding(false);};
  const del=(id)=>{if(!confirm("¿Eliminar?")) return;updateData({...data,expenses:data.expenses.filter(e=>e.id!==id)});setEditing(null);};
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12,alignItems:"center"}}>
        {[["list","Lista"],["balances","Balances"],["liquidar","Liquidar"]].map(([k,l])=>(
          <Pill key={k} active={view===k} onClick={()=>setView(k)}>{l}</Pill>
        ))}
        <button onClick={()=>setAdding(true)} style={{...base.btn,marginLeft:"auto",padding:"7px 12px",fontSize:11}}>+ Gasto</button>
      </div>
      {view==="list"&&<>
        <Card style={{marginBottom:12,textAlign:"center",padding:16,background:C.accentBg,border:"none"}}>
          <div style={{fontSize:9,fontWeight:700,color:C.accent,letterSpacing:1.2,textTransform:"uppercase"}}>Total registrado</div>
          <div style={{fontSize:26,fontWeight:800,color:C.text,marginTop:4}}>{fmtCLP(total)}</div>
        </Card>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
          {Object.entries(catTotals).map(([k,v])=>CATEGORIES[k]?<Badge key={k} color={CATEGORIES[k].color}>{CATEGORIES[k].label} · {fmtCLP(v)}</Badge>:null)}
        </div>
        {data.expenses.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:C.mute,fontSize:12}}>Sin gastos aún.</div>}
        {data.expenses.map(e=>{
          const cat=CATEGORIES[e.category];
          return(
            <Card key={e.id} style={{marginBottom:7,padding:13}} onClick={()=>setEditing(e)}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{width:3,height:36,background:cat?.color||C.mute,borderRadius:2,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:C.text}}>{e.desc}</div>
                  <div style={{color:C.sub,fontSize:10.5,marginTop:2}}>Pagó <b>{e.paidBy}</b> · ÷{e.split?.length||1} · {e.date}</div>
                </div>
                <div style={{fontWeight:700,fontSize:13,color:C.text}}>{fmtCLP(e.amount)}</div>
              </div>
            </Card>
          );
        })}
      </>}
      {view==="balances"&&data.trip.travelers.map(t=>{
        const b=balances[t]||0;const pos=b>=0;
        const pagado=data.expenses.filter(e=>e.paidBy===t).reduce((s,e)=>s+e.amount,0);
        return(
          <Card key={t} style={{marginBottom:8,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:40,height:40,borderRadius:20,fontWeight:700,fontSize:16,background:pos?C.successBg:C.dangerBg,color:pos?C.success:C.danger,display:"flex",alignItems:"center",justifyContent:"center"}}>{t[0]}</div>
                <div><div style={{fontWeight:700,color:C.text}}>{t}</div><div style={{color:C.sub,fontSize:10.5}}>Pagó {fmtCLP(pagado)}</div></div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800,fontSize:20,color:pos?C.success:C.danger}}>{pos?"+":""}{fmtCLP(b)}</div>
                <div style={{color:C.mute,fontSize:9,letterSpacing:0.8}}>{pos?"LE DEBEN":"DEBE"}</div>
              </div>
            </div>
          </Card>
        );
      })}
      {view==="liquidar"&&(settlements.length===0
        ?<Card style={{padding:32,textAlign:"center"}}><div style={{fontSize:28,marginBottom:8}}>✓</div><div style={{fontWeight:600,color:C.text}}>Todo equilibrado</div></Card>
        :settlements.map((s,i)=>(
          <Card key={i} style={{marginBottom:8,padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:34,height:34,borderRadius:17,background:C.dangerBg,color:C.danger,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{s.from[0]}</div>
              <div style={{flex:1,fontSize:13,color:C.text}}><b>{s.from}</b> <span style={{color:C.mute}}>→</span> <b>{s.to}</b></div>
              <div style={{background:C.text,color:C.bg,fontWeight:700,padding:"7px 14px",borderRadius:10,fontSize:13}}>{fmtCLP(s.amount)}</div>
            </div>
          </Card>
        ))
      )}
      <Modal open={!!editing||adding} onClose={()=>{setEditing(null);setAdding(false);}} title={editing?"Editar gasto":"Nuevo gasto"}>
        <ExpenseForm exp={editing} travelers={data.trip.travelers} onSave={save} onDelete={editing?()=>del(editing.id):null}/>
      </Modal>
    </div>
  );
}
function ExpenseForm({exp,travelers,onSave,onDelete}){
  const [f,setF]=useState(exp||{desc:"",amount:0,category:"food",date:"",paidBy:travelers[0],split:[...travelers]});
  const tog=t=>setF(p=>({...p,split:p.split.includes(t)?p.split.filter(x=>x!==t):[...p.split,t]}));
  return(
    <div>
      <Inp label="Descripción" value={f.desc} onChange={v=>setF({...f,desc:v})} placeholder="Ej. Hotel Roma"/>
      <Inp label="Monto (CLP)" type="number" value={f.amount} onChange={v=>setF({...f,amount:Number(v)||0})}/>
      <Sel label="Categoría" value={f.category} onChange={v=>setF({...f,category:v})} options={Object.entries(CATEGORIES).map(([k,v])=>({value:k,label:v.label}))}/>
      <Inp label="Fecha" value={f.date} onChange={v=>setF({...f,date:v})} placeholder="26 Jul"/>
      <Sel label="Pagó" value={f.paidBy} onChange={v=>setF({...f,paidBy:v})} options={travelers}/>
      <div style={{marginBottom:14}}>
        <label style={base.label}>Dividir entre</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {travelers.map(t=><Pill key={t} active={f.split.includes(t)} onClick={()=>tog(t)}>{t}</Pill>)}
        </div>
        {f.split.length>0&&<div style={{color:C.mute,fontSize:10,marginTop:6}}>{fmtCLP(f.amount/f.split.length)} por persona</div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>onSave(f)} style={{...base.btn,flex:1}}>Guardar</button>
        {onDelete&&<button onClick={onDelete} style={{...base.ghost,color:C.danger,borderColor:C.danger+"40"}}>Eliminar</button>}
      </div>
    </div>
  );
}
function ReservationsView({type,data,updateData,label}){
  const [editing,setEditing]=useState(null);
  const [adding,setAdding]=useState(false);
  const list=data.reservations.filter(r=>r.type===type);
  const total=list.reduce((s,r)=>s+r.cost,0);
  const save=(r)=>{updateData({...data,reservations:r.id?data.reservations.map(x=>x.id===r.id?r:x):[...data.reservations,{...r,id:uid(),type}]});setEditing(null);setAdding(false);};
  const del=(id)=>{if(!confirm("¿Eliminar?")) return;updateData({...data,reservations:data.reservations.filter(r=>r.id!==id)});setEditing(null);};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><span style={{fontWeight:700,fontSize:15,color:C.text}}>{list.length} {label}{list.length!==1?"s":""}</span><span style={{color:C.sub,fontSize:12,marginLeft:8}}>Total: {fmtCLP(total)}</span></div>
        <button onClick={()=>setAdding(true)} style={{...base.btn,padding:"7px 12px",fontSize:11}}>+ {label}</button>
      </div>
      {list.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:C.mute,fontSize:12}}>Sin {label.toLowerCase()}s registrados.</div>}
      {list.map((r,i)=>(
        <div key={r.id}>
          <Card style={{marginBottom:5,padding:14}} onClick={()=>setEditing(r)}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:7,marginBottom:5,alignItems:"center"}}>
                  <Badge color={r.status==="confirmed"?C.success:C.warn}>{r.status==="confirmed"?"Confirmado":"Pendiente"}</Badge>
                  <span style={{color:C.mute,fontSize:10}}>{r.airline||r.platform}</span>
                </div>
                <div style={{fontWeight:600,fontSize:14,color:C.text}}>{r.title}</div>
                {type==="flight"?<div style={{color:C.sub,fontSize:11,marginTop:3}}>{r.departure} → {r.arrival}</div>:<div style={{color:C.sub,fontSize:11,marginTop:3}}>{r.checkIn} → {r.checkOut} · {r.nights} noches</div>}
                {r.booking&&<div style={{color:C.mute,fontSize:9,fontFamily:"monospace",marginTop:4}}>#{r.booking}</div>}
                {r.notes&&<div style={{color:C.mute,fontSize:10,marginTop:3}}>{r.notes}</div>}
              </div>
              <div style={{fontWeight:700,fontSize:14,flexShrink:0,color:C.text}}>{fmtCLP(r.cost)}</div>
            </div>
          </Card>
          {type==="flight"&&i<list.length-1&&<div style={{textAlign:"center",color:C.mute,fontSize:10,margin:"3px 0"}}>↓</div>}
        </div>
      ))}
      <Modal open={!!editing||adding} onClose={()=>{setEditing(null);setAdding(false);}} title={editing?`Editar ${label}`:`Nuevo ${label}`}>
        <ReservationForm r={editing} type={type} onSave={save} onDelete={editing?()=>del(editing.id):null}/>
      </Modal>
    </div>
  );
}
function ReservationForm({r,type,onSave,onDelete}){
  const [f,setF]=useState(r||{title:"",airline:"",platform:"",departure:"",arrival:"",checkIn:"",checkOut:"",nights:1,city:"",cost:0,status:"pending",booking:"",notes:""});
  return(
    <div>
      <Inp label="Nombre" value={f.title} onChange={v=>setF({...f,title:v})} placeholder={type==="flight"?"ej. SCL → Madrid":"ej. Hotel Roma"}/>
      {type==="flight"?<>
        <Inp label="Aerolínea" value={f.airline} onChange={v=>setF({...f,airline:v})} placeholder="LATAM, Iberia..."/>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><Inp label="Salida" value={f.departure} onChange={v=>setF({...f,departure:v})} placeholder="22 Jul 22:00"/></div>
          <div style={{flex:1}}><Inp label="Llegada" value={f.arrival} onChange={v=>setF({...f,arrival:v})} placeholder="23 Jul 14:00"/></div>
        </div>
      </>:<>
        <Inp label="Ciudad" value={f.city} onChange={v=>setF({...f,city:v})}/>
        <Inp label="Plataforma" value={f.platform} onChange={v=>setF({...f,platform:v})} placeholder="Booking, Airbnb..."/>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><Inp label="Check-in" value={f.checkIn} onChange={v=>setF({...f,checkIn:v})} placeholder="22 Jul"/></div>
          <div style={{flex:1}}><Inp label="Check-out" value={f.checkOut} onChange={v=>setF({...f,checkOut:v})} placeholder="24 Jul"/></div>
        </div>
        <Inp label="Noches" type="number" value={f.nights} onChange={v=>setF({...f,nights:parseInt(v)||1})}/>
      </>}
      <Inp label="Costo (CLP)" type="number" value={f.cost} onChange={v=>setF({...f,cost:Number(v)||0})}/>
      <Sel label="Estatus" value={f.status} onChange={v=>setF({...f,status:v})} options={[{value:"pending",label:"Pendiente"},{value:"confirmed",label:"Confirmado"}]}/>
      <Inp label="N° reserva" value={f.booking} onChange={v=>setF({...f,booking:v})}/>
      <Inp label="Notas" value={f.notes} onChange={v=>setF({...f,notes:v})}/>
      <div style={{display:"flex",gap:8,marginTop:6}}>
        <button onClick={()=>onSave(f)} style={{...base.btn,flex:1}}>Guardar</button>
        {onDelete&&<button onClick={onDelete} style={{...base.ghost,color:C.danger,borderColor:C.danger+"40"}}>Eliminar</button>}
      </div>
    </div>
  );
}
function BudgetTab({data}){
  const totalExp=data.expenses.reduce((s,e)=>s+e.amount,0);
  const totalRes=data.reservations.reduce((s,r)=>s+r.cost,0);
  const committed=totalExp+totalRes;
  const remaining=data.trip.budget-committed;
  const pct=Math.min((committed/(data.trip.budget||1))*100,100);
  const catTotals={};
  data.expenses.forEach(e=>{catTotals[e.category]=(catTotals[e.category]||0)+e.amount;});
  return(
    <div>
      <Card style={{marginBottom:12,padding:20,background:C.accentBg,border:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
          <div><div style={{fontSize:10,fontWeight:700,color:C.accent,letterSpacing:1.2,textTransform:"uppercase"}}>Presupuesto</div><div style={{fontSize:24,fontWeight:800,color:C.text}}>{fmtCLP(data.trip.budget)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:10,fontWeight:700,color:remaining>=0?C.success:C.danger,letterSpacing:1.2,textTransform:"uppercase"}}>Disponible</div><div style={{fontSize:24,fontWeight:800,color:remaining>=0?C.success:C.danger}}>{fmtCLP(remaining)}</div></div>
        </div>
        <div style={{background:"rgba(0,0,0,0.08)",borderRadius:6,height:8,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:pct>90?C.danger:C.accent,borderRadius:6}}/>
        </div>
        <div style={{marginTop:6,color:C.sub,fontSize:11}}>{pct.toFixed(1)}% comprometido</div>
      </Card>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[["Gastado",totalExp,C.danger],["Reservas",totalRes,C.warn],["Por persona",committed/(data.trip.travelers.length||1),C.blue]].map(([l,v,c])=>(
          <Card key={l} style={{flex:1,padding:12,textAlign:"center"}}>
            <div style={{fontSize:9,fontWeight:700,color:C.mute,letterSpacing:1,textTransform:"uppercase"}}>{l}</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:4,color:c}}>{fmtCLP(v)}</div>
          </Card>
        ))}
      </div>
      {Object.keys(catTotals).length>0&&(
        <Card style={{padding:16}}>
          <div style={{fontSize:10,fontWeight:700,color:C.mute,letterSpacing:1.2,textTransform:"uppercase",marginBottom:12}}>Por categoría</div>
          {Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
            const cat=CATEGORIES[k];if(!cat) return null;
            const p=(v/totalExp)*100;
            return(
              <div key={k} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:C.text}}>{cat.label}</span><span style={{color:C.sub,fontSize:11}}>{fmtCLP(v)} · {p.toFixed(0)}%</span></div>
                <div style={{background:C.alt,borderRadius:3,height:4}}><div style={{height:"100%",width:`${p}%`,background:cat.color,borderRadius:3}}/></div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
function MapTab({data}){
  const dests=[...data.destinations].sort((a,b)=>a.order-b.order);
  const routeUrl=dests.length>0?"https://www.google.com/maps/dir/"+dests.map(d=>encodeURIComponent(d.city)).join("/"):"https://www.google.com/maps";
  return(
    <div>
      <Card style={{marginBottom:12,padding:0,overflow:"hidden"}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontWeight:700,fontSize:15,color:C.text}}>Ruta completa</div><div style={{color:C.sub,fontSize:11,marginTop:2}}>{dests.length} ciudades · {dests.reduce((s,d)=>s+d.nights,0)} noches</div></div>
          <a href={routeUrl} target="_blank" rel="noopener noreferrer" style={{...base.btn,textDecoration:"none",fontSize:11,padding:"8px 14px"}}>Abrir Maps ↗</a>
        </div>
        <div style={{background:"#E8F0F8",height:180,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(160deg,#D0DEE8 0%,#C0D0E0 100%)"}}/>
          {dests.length>1&&(<svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
            {dests.slice(0,-1).map((_,i)=>{
              const pos=[[10,55],[25,45],[50,50],[57,62],[75,65],[82,57],[30,35],[44,25],[60,30],[40,70]];
              const a=pos[i]||[50,50];const b=pos[i+1]||[60,60];
              return <line key={i} x1={`${a[0]}%`} y1={`${a[1]}%`} x2={`${b[0]}%`} y2={`${b[1]}%`} stroke="#C8956C" strokeWidth="1.5" strokeDasharray="4,3" strokeOpacity="0.8"/>;
            })}
          </svg>)}
          {dests.map((d,i)=>{
            const pos=[[10,55],[25,45],[50,50],[57,62],[75,65],[82,57],[30,35],[44,25],[60,30],[40,70]];
            const p=pos[i]||[50,50];
            return(
              <a key={d.id} href={`https://www.google.com/maps/search/${encodeURIComponent(d.city)}`} target="_blank" rel="noopener noreferrer" style={{position:"absolute",left:`${p[0]}%`,top:`${p[1]}%`,transform:"translate(-50%,-50%)",zIndex:5,textDecoration:"none"}}>
                <div style={{width:26,height:26,borderRadius:13,background:C.text,color:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:11,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{i+1}</div>
                <div style={{position:"absolute",top:"110%",left:"50%",transform:"translateX(-50%)",fontSize:8,color:C.text,fontWeight:600,whiteSpace:"nowrap",background:"rgba(255,255,255,0.85)",padding:"1px 4px",borderRadius:3}}>{d.city}</div>
              </a>
            );
          })}
        </div>
      </Card>
      {dests.map((d,i)=>(
        <Card key={d.id} style={{marginBottom:7,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <div style={{width:30,height:30,borderRadius:15,background:C.text,color:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13}}>{i+1}</div>
              <div><div style={{fontWeight:700,fontSize:14,color:C.text}}>{d.emoji} {d.city}</div><div style={{color:C.sub,fontSize:11}}>{d.nights} noche{d.nights!==1?"s":""}</div></div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(d.city+" metro transporte")}`} target="_blank" rel="noopener noreferrer" style={{...base.ghost,textDecoration:"none",fontSize:10,padding:"5px 9px"}}>Metro ⊙</a>
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(d.city)}`} target="_blank" rel="noopener noreferrer" style={{...base.ghost,textDecoration:"none",fontSize:10,padding:"5px 9px"}}>Maps ↗</a>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
function PackingTab({data,updateData}){
  const [open,setOpen]=useState(Object.keys(data.packing)[0]);
  const [newItem,setNewItem]=useState("");
  const [addingTo,setAddingTo]=useState(null);
  const [newCat,setNewCat]=useState("");
  const [addingCat,setAddingCat]=useState(false);
  const [editingItem,setEditingItem]=useState(null);
  const [editText,setEditText]=useState("");
  const all=Object.values(data.packing).flat();
  const done=all.filter(i=>i.checked).length;
  const pct=all.length>0?(done/all.length)*100:0;
  const updatePack=(p)=>updateData({...data,packing:p});
  const toggle=(cat,idx)=>{const p={...data.packing};p[cat]=p[cat].map((x,i)=>i===idx?{...x,checked:!x.checked}:x);updatePack(p);};
  const addItem=(cat)=>{if(!newItem.trim()) return;const p={...data.packing};p[cat]=[...p[cat],{item:newItem.trim(),checked:false}];updatePack(p);setNewItem("");setAddingTo(null);};
  const deleteItem=(cat,idx)=>{const p={...data.packing};p[cat]=p[cat].filter((_,i)=>i!==idx);updatePack(p);setEditingItem(null);};
  const saveEdit=(cat,idx)=>{if(!editText.trim()) return;const p={...data.packing};p[cat]=p[cat].map((x,i)=>i===idx?{...x,item:editText.trim()}:x);updatePack(p);setEditingItem(null);};
  const addCategory=()=>{if(!newCat.trim()) return;updatePack({...data.packing,[newCat.trim()]:[]});setNewCat("");setAddingCat(false);setOpen(newCat.trim());};
  const uncheckAll=(cat)=>{const p={...data.packing};p[cat]=p[cat].map(x=>({...x,checked:false}));updatePack(p);};
  const deleteCat=(cat)=>{if(!confirm(`¿Eliminar "${cat}"?`)) return;const p={...data.packing};delete p[cat];updatePack(p);setOpen(Object.keys(p)[0]||null);};
  return(
    <div>
      <Card style={{marginBottom:12,padding:16,background:C.accentBg,border:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
          <div><div style={{fontSize:10,fontWeight:700,color:C.accent,letterSpacing:1.2,textTransform:"uppercase"}}>Empacado</div><div style={{fontSize:24,fontWeight:800,marginTop:3,color:C.text}}>{done} / {all.length}</div></div>
          <div style={{fontSize:22,fontWeight:800,color:pct===100?C.success:C.accent}}>{Math.round(pct)}%</div>
        </div>
        <div style={{background:"rgba(0,0,0,0.08)",borderRadius:6,height:7,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:pct===100?C.success:C.accent,borderRadius:6,transition:"width 0.4s"}}/>
        </div>
        {pct===100&&<div style={{color:C.success,fontSize:11,fontWeight:600,marginTop:6}}>¡Todo listo! 🎉</div>}
        <div style={{color:C.mute,fontSize:10,marginTop:6}}>☁ Sincronizado con Cata en tiempo real</div>
      </Card>
      {Object.entries(data.packing).map(([cat,items])=>{
        const catDone=items.filter(i=>i.checked).length;
        const isOpen=open===cat;
        return(
          <Card key={cat} style={{marginBottom:7,padding:0,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",padding:"13px 14px",cursor:"pointer"}} onClick={()=>setOpen(isOpen?null:cat)}>
              <div style={{flex:1,fontWeight:600,fontSize:13.5,color:C.text}}>{cat}</div>
              <span style={{fontSize:10,color:catDone===items.length&&items.length>0?C.success:C.mute,fontWeight:600,marginRight:8}}>{catDone}/{items.length}</span>
              <span style={{color:C.mute,fontSize:13}}>{isOpen?"−":"+"}</span>
            </div>
            {isOpen&&(
              <div style={{borderTop:`1px solid ${C.borderLight}`}}>
                {items.map((it,idx)=>(
                  <div key={idx} style={{borderBottom:`1px solid ${C.borderLight}`,padding:"0 14px"}}>
                    {editingItem?.cat===cat&&editingItem?.idx===idx
                      ?<div style={{display:"flex",gap:6,padding:"8px 0"}}>
                        <input autoFocus value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveEdit(cat,idx);if(e.key==="Escape")setEditingItem(null);}} style={{...base.input,flex:1,padding:"7px 10px",marginBottom:0,fontSize:12}}/>
                        <button onClick={()=>saveEdit(cat,idx)} style={{...base.btn,padding:"7px 12px",fontSize:11}}>✓</button>
                        <button onClick={()=>deleteItem(cat,idx)} style={{...base.ghost,padding:"7px 10px",fontSize:11,color:C.danger,borderColor:C.danger+"40"}}>×</button>
                      </div>
                      :<div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0"}}>
                        <div onClick={()=>toggle(cat,idx)} style={{width:19,height:19,borderRadius:6,flexShrink:0,cursor:"pointer",background:it.checked?C.text:C.surface,border:it.checked?"none":`1.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.bg}}>{it.checked&&"✓"}</div>
                        <span onClick={()=>toggle(cat,idx)} style={{flex:1,fontSize:13,cursor:"pointer",color:it.checked?C.mute:C.text,textDecoration:it.checked?"line-through":"none"}}>{it.item}</span>
                        <button onClick={()=>{setEditingItem({cat,idx});setEditText(it.item);}} style={{background:"none",border:"none",cursor:"pointer",color:C.mute,fontSize:12,padding:"0 4px"}}>✎</button>
                      </div>
                    }
                  </div>
                ))}
                <div style={{padding:"8px 14px"}}>
                  {addingTo===cat
                    ?<div style={{display:"flex",gap:7}}>
                      <input autoFocus value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addItem(cat);if(e.key==="Escape")setAddingTo(null);}} style={{...base.input,flex:1,padding:"8px 10px",marginBottom:0,fontSize:12}} placeholder="Nuevo ítem..."/>
                      <button onClick={()=>addItem(cat)} style={{...base.btn,padding:"8px 12px",fontSize:11}}>+</button>
                    </div>
                    :<div style={{display:"flex",justifyContent:"space-between"}}>
                      <button onClick={()=>{setAddingTo(cat);setNewItem("");}} style={{background:"none",border:"none",cursor:"pointer",color:C.sub,fontSize:12,padding:"4px 0",fontFamily:"inherit"}}>+ Agregar ítem</button>
                      <div style={{display:"flex",gap:10}}>
                        <button onClick={()=>uncheckAll(cat)} style={{background:"none",border:"none",cursor:"pointer",color:C.mute,fontSize:10,padding:"4px 0",fontFamily:"inherit"}}>Desmarcar</button>
                        <button onClick={()=>deleteCat(cat)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:10,padding:"4px 0",fontFamily:"inherit"}}>Eliminar cat.</button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            )}
          </Card>
        );
      })}
      {addingCat
        ?<div style={{display:"flex",gap:7,marginTop:8}}>
          <input autoFocus value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCategory();if(e.key==="Escape")setAddingCat(false);}} style={base.input} placeholder="Nombre de la categoría..."/>
          <button onClick={addCategory} style={base.btn}>Crear</button>
        </div>
        :<button onClick={()=>setAddingCat(true)} style={{...base.ghost,width:"100%",marginTop:8,padding:"12px"}}>+ Nueva categoría</button>
      }
    </div>
  );
}
export default function App(){
  const [data,setData]=useState(EMPTY_DATA);
  const [tab,setTab]=useState("itinerary");
  const [sync,setSync]=useState("syncing");
  const [showSettings,setShowSettings]=useState(false);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const unsub=subscribeToFirebase((remoteData)=>{
      setData(remoteData);setSync("saved");setLoaded(true);
    });
    const timer=setTimeout(()=>{if(!loaded){setLoaded(true);setSync("saved");}},3000);
    return()=>{unsub();clearTimeout(timer);};
  },[]);
  const updateData=useCallback((newData)=>{
    const withTs={...newData,lastSaved:Date.now()};
    setData(withTs);setSync("saving");
    saveToFirebase(withTs).then(ok=>setSync(ok?"saved":"error"));
  },[]);
  if(!loaded){
    return(
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>✈️</div><div style={{color:C.mute,fontSize:13}}>Cargando tu viaje...</div></div>
      </div>
    );
  }
  if(!data.configured){
    return <SetupWizard onFinish={d=>updateData({...d,configured:true})}/>;
  }
  const renderTab=()=>{
    switch(tab){
      case "itinerary": return <ItineraryTab data={data} updateData={updateData}/>;
      case "expenses": return <ExpensesTab data={data} updateData={updateData}/>;
      case "flights": return <ReservationsView type="flight" data={data} updateData={updateData} label="Vuelo"/>;
      case "hotels": return <ReservationsView type="hotel" data={data} updateData={updateData} label="Hotel"/>;
      case "budget": return <BudgetTab data={data} updateData={updateData}/>;
      case "map": return <MapTab data={data}/>;
      case "packing": return <PackingTab data={data} updateData={updateData}/>;
      default: return null;
    }
  };
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:C.text,display:"flex",flexDirection:"column"}}>
      <Header data={data} sync={sync} onSettings={()=>setShowSettings(true)}/>
      <TabBar active={tab} onChange={setTab}/>
      <div style={{flex:1,padding:tab==="itinerary"?0:"14px 14px 40px",overflowX:"hidden"}}>
        {renderTab()}
      </div>
      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} data={data} updateData={updateData}/>
    </div>
  );
}

