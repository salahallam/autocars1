const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// Minimal .env loader so Node 18+ works without an extra dependency.
(function loadDotEnv(){
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const key = line.slice(0,i).trim();
      let value = line.slice(i+1).trim();
      if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (e) { console.warn('Could not load .env:', e.message); }
})();
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const DELIVERY_FEE = Number(process.env.DELIVERY_FEE || 0);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (process.env.NODE_ENV === 'production' && !ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set in production.');
}
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AGENCY_EMAIL = process.env.AGENCY_EMAIL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'autocars. <onboarding@resend.dev>';
const AGENCY_WHATSAPP = process.env.AGENCY_WHATSAPP || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const sessions = new Map();

const INITIAL_CARS = [
  { id:'dacia-sandero', name:'Dacia Sandero', price:250, image:'assets/dacia-sandero.jpg', tag:'Économique', description:'Citadine pratique et économique.', status:'available', active:true },
  { id:'dacia-logan', name:'Dacia Logan', price:250, image:'assets/dacia-logan.jpg', tag:'Berline', description:'Berline confortable pour les trajets quotidiens.', status:'available', active:true },
  { id:'mercedes-c63', name:'Mercedes-AMG C63', price:1000, image:'assets/mercedes-c63.jpg', tag:'Premium', description:'Berline sportive haut de gamme.', status:'available', active:true },
  { id:'mercedes-coupe', name:'Mercedes C Coupé', price:1000, image:'assets/mercedes-coupe.jpg', tag:'Premium', description:'Coupé élégant au positionnement premium.', status:'available', active:true },
  { id:'mercedes-g-class', name:'Mercedes G-Class', price:1000, image:'assets/mercedes-g-class.jpg', tag:'SUV Premium', description:'SUV premium pour une expérience plus exclusive.', status:'available', active:true }
];

function ensureLocalData(){
  if(!fs.existsSync(DATA_FILE)){
    fs.writeFileSync(DATA_FILE, JSON.stringify({cars:INITIAL_CARS, bookings:[]}, null, 2));
  }
}
function localRead(){ ensureLocalData(); return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
function localWrite(data){
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data,null,2));
  fs.renameSync(tmp, DATA_FILE);
}

async function supabaseRequest(table, options={}){
  const url = `${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${table}${options.query || ''}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if(!response.ok){
    const err = new Error(typeof data === 'string' ? data : (data?.message || data?.hint || 'Supabase request failed'));
    err.status = response.status;
    throw err;
  }
  return data;
}

function json(res, status, data, headers={}){
  const body = JSON.stringify(data);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
  res.end(body);
}
function text(res,status,body,contentType='text/plain; charset=utf-8'){
  res.writeHead(status,{'Content-Type':contentType}); res.end(body);
}
function redirect(res, location){ res.writeHead(302,{Location:location}); res.end(); }
function parseCookies(req){
  const out={};
  for(const part of (req.headers.cookie || '').split(';')){
    const [k,...v]=part.trim().split('='); if(k) out[k]=decodeURIComponent(v.join('='));
  }
  return out;
}
function isAdmin(req){
  const token = parseCookies(req).autocars_admin;
  if(!token) return false;
  const session = sessions.get(token);
  if(!session) return false;
  if(session.expires < Date.now()){ sessions.delete(token); return false; }
  return true;
}
function requireAdmin(req,res){
  if(!isAdmin(req)){ json(res,401,{ok:false,message:'Authentification administrateur requise.'}); return false; }
  return true;
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data',chunk=>{
      data += chunk;
      if(data.length > 1_000_000){ req.destroy(); reject(new Error('Payload too large')); }
    });
    req.on('end',()=>{
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON invalide.')); }
    });
    req.on('error',reject);
  });
}
function clean(value,max=500){ return String(value ?? '').trim().slice(0,max); }
function validISODate(value){ return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function calculateDays(pickup, ret){
  if(!validISODate(pickup)||!validISODate(ret)) return 0;
  const a = new Date(`${pickup}T00:00:00Z`), b = new Date(`${ret}T00:00:00Z`);
  const days = Math.round((b-a)/86400000);
  return Number.isFinite(days) && days >= 1 ? days : 0;
}
function bookingId(){ return `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }

async function getCars(){
  if(useSupabase){
    return await supabaseRequest('cars',{query:'?select=id,name,price,image,tag,description,status,active&active=eq.true&order=name.asc'});
  }
  return localRead().cars.filter(c=>c.active!==false);
}
async function getAllCars(){
  if(useSupabase) return await supabaseRequest('cars',{query:'?select=id,name,price,image,tag,description,status,active&order=name.asc'});
  return localRead().cars;
}
async function getCar(carId){
  if(useSupabase){
    const rows=await supabaseRequest('cars',{query:`?select=id,name,price,image,tag,description,status,active&id=eq.${encodeURIComponent(carId)}&limit=1`});
    return rows[0] || null;
  }
  return localRead().cars.find(c=>c.id===carId) || null;
}
async function getBookings(){
  if(useSupabase) return await supabaseRequest('bookings',{query:'?select=*&order=created_at.desc'});
  return localRead().bookings.sort((a,b)=>String(b.created_at||b.createdAt).localeCompare(String(a.created_at||a.createdAt)));
}
async function getBooking(id){
  if(useSupabase){
    const rows=await supabaseRequest('bookings',{query:`?select=*&id=eq.${encodeURIComponent(id)}&limit=1`});
    return rows[0] || null;
  }
  return localRead().bookings.find(b=>b.id===id) || null;
}
async function hasOverlap(carId,pickup,ret,excludeId=''){
  const bookings = useSupabase
    ? await supabaseRequest('bookings',{query:`?select=id,status,pickup_date,return_date&car_id=eq.${encodeURIComponent(carId)}&status=in.(pending,confirmed)`})
    : localRead().bookings.filter(b=>b.carId===carId && ['pending','confirmed'].includes(b.status));
  return bookings.some(b => b.id!==excludeId && pickup < b.return_date && ret > b.pickup_date);
}

async function createBooking(payload){
  const car = await getCar(clean(payload.carId,100));
  if(!car || car.active===false) throw Object.assign(new Error('Véhicule introuvable.'),{status:400});
  if(car.status==='maintenance') throw Object.assign(new Error('Ce véhicule est actuellement indisponible.'),{status:409});

  const pickup = clean(payload.pickupDate,10), ret = clean(payload.returnDate,10);
  const days = calculateDays(pickup,ret);
  if(!days) throw Object.assign(new Error('Dates de réservation invalides.'),{status:400});
  if(await hasOverlap(car.id,pickup,ret)) throw Object.assign(new Error('Ce véhicule est déjà demandé ou réservé pour cette période.'),{status:409});

  const booking = {
    id: bookingId(),
    created_at: new Date().toISOString(),
    status: 'pending',
    car_id: car.id,
    car_name: car.name,
    price_per_day: Number(car.price),
    pickup_date: pickup,
    return_date: ret,
    days,
    delivery_fee: DELIVERY_FEE,
    total: days * Number(car.price) + DELIVERY_FEE,
    full_name: clean(payload.fullName,150),
    phone: clean(payload.phone,50),
    cin: clean(payload.cin,80),
    city: clean(payload.city,100),
    delivery_location: clean(payload.deliveryLocation,300),
    notes: clean(payload.notes,1000)
  };
  for(const field of ['full_name','phone','cin','city','delivery_location']){
    if(!booking[field]) throw Object.assign(new Error('Veuillez compléter toutes les informations obligatoires.'),{status:400});
  }

  if(useSupabase){
    const rows = await supabaseRequest('bookings',{method:'POST',body:booking,prefer:'return=representation'});
    return rows[0] || booking;
  }
  const data=localRead();
  data.bookings.push({...booking,carId:booking.car_id,carName:booking.car_name,pricePerDay:booking.price_per_day,pickupDate:booking.pickup_date,returnDate:booking.return_date,deliveryFee:booking.delivery_fee,fullName:booking.full_name,deliveryLocation:booking.delivery_location});
  localWrite(data);
  return booking;
}

async function updateBookingStatus(id,status){
  const allowed=['pending','confirmed','rejected','completed','cancelled'];
  if(!allowed.includes(status)) throw Object.assign(new Error('Statut invalide.'),{status:400});
  const booking=await getBooking(id);
  if(!booking) throw Object.assign(new Error('Réservation introuvable.'),{status:404});

  if(status==='confirmed'){
    if(await hasOverlap(booking.car_id || booking.carId, booking.pickup_date || booking.pickupDate, booking.return_date || booking.returnDate, id)){
      throw Object.assign(new Error('Impossible de confirmer : la période chevauche une autre réservation.'),{status:409});
    }
  }

  if(useSupabase){
    const rows=await supabaseRequest('bookings',{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}`,body:{status},prefer:'return=representation'});
    return rows[0] || {...booking,status};
  }
  const data=localRead();
  const i=data.bookings.findIndex(b=>b.id===id);
  data.bookings[i].status=status;
  localWrite(data);
  return data.bookings[i];
}

async function updateCarStatus(id,status){
  if(!['available','booked','maintenance'].includes(status)) throw Object.assign(new Error('Statut véhicule invalide.'),{status:400});
  const car=await getCar(id); if(!car) throw Object.assign(new Error('Véhicule introuvable.'),{status:404});
  if(useSupabase){
    const rows=await supabaseRequest('cars',{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}`,body:{status},prefer:'return=representation'});
    return rows[0] || {...car,status};
  }
  const data=localRead(); const i=data.cars.findIndex(c=>c.id===id); data.cars[i].status=status; localWrite(data); return data.cars[i];
}

function buildNotification(booking){
  return `Nouvelle demande de réservation\n\nRéférence: ${booking.id}\nVéhicule: ${booking.car_name}\nDates: ${booking.pickup_date} → ${booking.return_date}\nDurée: ${booking.days} jour(s)\nTotal: ${booking.total} DH\n\nClient: ${booking.full_name}\nTéléphone: ${booking.phone}\nCIN: ${booking.cin}\nVille: ${booking.city}\nLieu: ${booking.delivery_location}\n${booking.notes ? `Note: ${booking.notes}` : ''}`;
}
async function notifyEmail(booking){
  if(!AGENCY_EMAIL || !RESEND_API_KEY) return;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:EMAIL_FROM,to:[AGENCY_EMAIL],subject:`Nouvelle réservation ${booking.id} — ${booking.car_name}`,text:buildNotification(booking)})});
  if(!response.ok) throw new Error('Email notification failed');
}
async function notifyWhatsApp(booking){
  if(!AGENCY_WHATSAPP || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;
  const endpoint=`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:AGENCY_WHATSAPP.replace(/\D/g,''),type:'text',text:{body:buildNotification(booking)}})});
  if(!response.ok) throw new Error('WhatsApp notification failed');
}
async function notifyAgency(booking){
  await Promise.allSettled([notifyEmail(booking),notifyWhatsApp(booking)]);
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.md':'text/plain; charset=utf-8'};
function serveStatic(req,res,urlPath){
  let rel=urlPath==='/'?'index.html':urlPath.slice(1);
  if(rel==='admin') rel='admin.html';
  const file=path.normalize(path.join(PUBLIC_DIR,rel));
  if(!file.startsWith(PUBLIC_DIR)) return text(res,403,'Forbidden');
  fs.stat(file,(err,st)=>{
    if(err || !st.isFile()) return text(res,404,'Not found');
    res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':urlPath.includes('assets/')?'public,max-age=86400':'no-cache'});
    fs.createReadStream(file).pipe(res);
  });
}

async function handle(req,res){
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const p=url.pathname;
  try{
    if(req.method==='GET' && p==='/api/health') return json(res,200,{ok:true,mode:useSupabase?'supabase':'local',time:new Date().toISOString()});
    if(req.method==='GET' && p==='/api/config') return json(res,200,{ok:true,deliveryFee:DELIVERY_FEE,backend:'autocars',supabase:useSupabase,emailConfigured:Boolean(AGENCY_EMAIL&&RESEND_API_KEY),whatsappConfigured:Boolean(AGENCY_WHATSAPP&&WHATSAPP_ACCESS_TOKEN&&WHATSAPP_PHONE_NUMBER_ID)});
    if(req.method==='GET' && p==='/api/cars') return json(res,200,{cars:await getCars()});
    if(req.method==='POST' && p==='/api/bookings'){
      const body=await readBody(req); const booking=await createBooking(body); notifyAgency(booking).catch(()=>{}); return json(res,201,{ok:true,id:booking.id,booking});
    }
    if(req.method==='POST' && p==='/api/admin/login'){
      const body=await readBody(req);
      if(!body.password || body.password!==ADMIN_PASSWORD) return json(res,401,{ok:false,message:'Mot de passe incorrect.'});
      const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{expires:Date.now()+8*60*60*1000});
      return json(res,200,{ok:true},{'Set-Cookie':`autocars_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`});
    }
    if(req.method==='POST' && p==='/api/admin/logout'){
      const token=parseCookies(req).autocars_admin; if(token) sessions.delete(token);
      return json(res,200,{ok:true},{'Set-Cookie':'autocars_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
    }
    if(req.method==='GET' && p==='/api/admin/session') return json(res,200,{authenticated:isAdmin(req)});
    if(req.method==='GET' && p==='/api/admin/bookings'){
      if(!requireAdmin(req,res)) return;
      return json(res,200,{bookings:await getBookings()});
    }
    if(req.method==='GET' && p==='/api/admin/cars'){
      if(!requireAdmin(req,res)) return;
      return json(res,200,{cars:await getAllCars()});
    }
    if(req.method==='POST' && p==='/api/admin/bookings/status'){
      if(!requireAdmin(req,res)) return;
      const body=await readBody(req); const booking=await updateBookingStatus(clean(body.bookingId,100),clean(body.status,30));
      return json(res,200,{ok:true,booking});
    }
    if(req.method==='POST' && p==='/api/admin/cars/status'){
      if(!requireAdmin(req,res)) return;
      const body=await readBody(req); const car=await updateCarStatus(clean(body.carId,100),clean(body.status,30));
      return json(res,200,{ok:true,car});
    }
    if(req.method==='GET') return serveStatic(req,res,p);
    return json(res,405,{ok:false,message:'Method not allowed'});
  }catch(err){
    console.error(err);
    const status=err.status || 500;
    return json(res,status,{ok:false,message:status===500?'Erreur serveur.':err.message});
  }
}

ensureLocalData();
http.createServer(handle).listen(PORT,()=>{
  console.log(`autocars. backend running on http://localhost:${PORT}`);
  console.log(`Storage: ${useSupabase?'Supabase':'local data.json'}`);
  if(!ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set; admin login is disabled.');
});
