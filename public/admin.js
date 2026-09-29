let bookings=[]; let cars=[];
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('fr-FR').format(Number(v||0))+' DH';
const statusLabel={pending:'En attente',confirmed:'Confirmée',rejected:'Refusée',completed:'Terminée',cancelled:'Annulée'};

async function api(url,options={}){
  const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.message||'Erreur serveur');
  return data;
}
async function init(){
  const session=await api('/api/admin/session');
  if(session.authenticated) return showAdmin();
  $('login-view').classList.remove('hidden');
}
function showAdmin(){ $('login-view').classList.add('hidden'); $('admin-view').classList.remove('hidden'); load(); }
async function load(){
  try{
    const [b,c,conf]=await Promise.all([api('/api/admin/bookings'),api('/api/admin/cars'),api('/api/config')]);
    bookings=b.bookings||[]; cars=c.cars||[];
    $('storage-badge').textContent=conf.supabase?'Supabase':'Mode local';
    renderStats(); renderBookings(); renderCars();
  }catch(e){alert(e.message)}
}
function renderStats(){
  const counts={pending:0,confirmed:0,completed:0}; bookings.forEach(b=>{if(counts[b.status]!=null)counts[b.status]++});
  $('stats').innerHTML=[['Total',bookings.length],['En attente',counts.pending],['Confirmées',counts.confirmed],['Terminées',counts.completed]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
}
function renderBookings(){
  const filter=$('status-filter').value;
  const rows=bookings.filter(b=>filter==='all'||b.status===filter);
  $('booking-body').innerHTML=rows.length?rows.map(b=>{
    const car=b.car_name||b.carName; const pickup=b.pickup_date||b.pickupDate; const ret=b.return_date||b.returnDate;
    const client=`<div class="client"><strong>${esc(b.full_name||b.fullName)}</strong><span>${esc(b.phone)}</span><span>${esc(b.city)}</span></div>`;
    const detail=`<div class="details">${esc(b.delivery_location||b.deliveryLocation)}${b.notes?`<br>${esc(b.notes)}`:''}</div>`;
    const actions=b.status==='pending'?`<div class="actions"><button onclick="setBooking('${b.id}','confirmed')">Confirmer</button><button onclick="setBooking('${b.id}','rejected')">Refuser</button></div>`:b.status==='confirmed'?`<div class="actions"><button onclick="setBooking('${b.id}','completed')">Terminer</button><button onclick="setBooking('${b.id}','cancelled')">Annuler</button></div>`:`<div class="actions"><button onclick="setBooking('${b.id}','pending')">Remettre en attente</button></div>`;
    return `<tr><td><strong>${esc(b.id)}</strong><br>${detail}</td><td>${client}</td><td>${esc(car)}<br><span class="details">${esc(b.cin||'')}</span></td><td>${pickup}<br>→ ${ret}<br><span class="details">${b.days} jour(s)</span></td><td><strong>${money(b.total)}</strong></td><td><span class="pill ${b.status}">${statusLabel[b.status]||b.status}</span></td><td>${actions}</td></tr>`;
  }).join(''):`<tr><td colspan="7" class="empty">Aucune réservation.</td></tr>`;
}
function renderCars(){
  $('cars-grid').innerHTML=cars.map(c=>`<div class="car-admin"><h3>${esc(c.name)}</h3><p>${money(c.price)} / jour</p><select onchange="setCar('${c.id}',this.value)"><option value="available" ${c.status==='available'?'selected':''}>Disponible</option><option value="booked" ${c.status==='booked'?'selected':''}>Réservée</option><option value="maintenance" ${c.status==='maintenance'?'selected':''}>Maintenance</option></select></div>`).join('');
}
async function setBooking(id,status){try{await api('/api/admin/bookings/status',{method:'POST',body:JSON.stringify({bookingId:id,status})});await load()}catch(e){alert(e.message)}}
async function setCar(id,status){try{await api('/api/admin/cars/status',{method:'POST',body:JSON.stringify({carId:id,status})});await load()}catch(e){alert(e.message)}}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-message').textContent='';try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';showAdmin()}catch(err){$('login-message').textContent=err.message}});
$('logout').addEventListener('click',async()=>{await api('/api/admin/logout',{method:'POST'});location.reload()});
$('refresh').addEventListener('click',load);$('status-filter').addEventListener('change',renderBookings);
window.setBooking=setBooking;window.setCar=setCar;init();
