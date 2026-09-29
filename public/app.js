/* autocars. frontend — connected to the Node backend */
const CONFIG = { DELIVERY_FEE: 0 };
let CARS = [];
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('fr-FR').format(Number(value||0)) + ' DH';
function getCar(id){ return CARS.find(c=>c.id===id); }
function daysBetween(start,end){
  if(!start||!end) return 0;
  const a=new Date(start+'T00:00:00Z'), b=new Date(end+'T00:00:00Z');
  const d=Math.round((b-a)/86400000); return d>=1?d:0;
}
async function loadCars(){
  const response=await fetch('/api/cars',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok) throw new Error(data.message||'Impossible de charger les véhicules.');
  CARS=data.cars||[];
  populateCars(); renderFleet(); updatePriceAndTotal();
}
function renderFleet(){
  $('fleet-grid').innerHTML=CARS.map(car=>{
    const unavailable=car.status!=='available';
    const label=car.status==='maintenance'?'Maintenance':unavailable?'Indisponible':'Disponible';
    return `<article class="car-card"><div class="car-image-wrap"><img class="car-image" src="${car.image}" alt="${car.name}" loading="lazy"><span class="car-status ${unavailable?'booked':''}">${label}</span></div><div class="car-body"><div class="car-top"><div><div class="car-name">${car.name}</div><div class="car-tag">${car.tag}</div></div><div class="car-price"><strong>${money(car.price)}</strong><span>par jour</span></div></div><div class="car-actions"><button class="btn btn-primary ${unavailable?'disabled':''}" ${unavailable?'disabled':''} data-book="${car.id}">${unavailable?'Indisponible':'Réserver'}</button><button class="btn btn-ghost" data-details="${car.id}">Détails</button></div></div></article>`;
  }).join('');
  document.querySelectorAll('[data-book]').forEach(b=>b.addEventListener('click',()=>{$('carId').value=b.dataset.book;updatePriceAndTotal();document.querySelector('#reservation').scrollIntoView({behavior:'smooth'})}));
  document.querySelectorAll('[data-details]').forEach(b=>b.addEventListener('click',()=>{const c=getCar(b.dataset.details);alert(`${c.name}\n${c.description}\n\nTarif : ${money(c.price)} / jour`)}));
}
function populateCars(){ $('carId').innerHTML=CARS.map(c=>`<option value="${c.id}">${c.name} — ${money(c.price)}/jour</option>`).join(''); }
function updatePriceAndTotal(){
  const car=getCar($('carId').value), days=daysBetween($('pickupDate').value,$('returnDate').value);
  $('selected-price').textContent=car?money(car.price)+' / jour':'—';
  $('days-output').textContent=days?`${days} jour${days>1?'s':''}`:'—';
  $('total-output').textContent=car&&days?money(days*car.price+CONFIG.DELIVERY_FEE):'—';
}
function showMessage(text,type){const el=$('form-message');el.textContent=text;el.className=`form-message show ${type}`;}
async function handleSubmit(event){
  event.preventDefault();
  const car=getCar($('carId').value), pickupDate=$('pickupDate').value, returnDate=$('returnDate').value, days=daysBetween(pickupDate,returnDate);
  if(!car)return showMessage('Veuillez sélectionner un véhicule.','error');
  if(!days)return showMessage('La date de retour doit être postérieure à la date de prise en charge.','error');
  const payload={carId:car.id,pickupDate,returnDate,fullName:$('fullName').value.trim(),phone:$('phone').value.trim(),cin:$('cin').value.trim(),city:$('city').value.trim(),deliveryLocation:$('deliveryLocation').value.trim(),notes:$('notes').value.trim()};
  try{
    const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.message||'Impossible d’envoyer la demande.');
    showMessage(`Demande envoyée. Référence : ${data.id}. L'agence doit confirmer la disponibilité.`,'success');
    $('booking-form').reset();$('selected-price').textContent='—';$('days-output').textContent='—';$('total-output').textContent='—';
    await loadCars();
  }catch(e){showMessage(e.message||'Une erreur est survenue.','error');}
}
function initDates(){
  const iso=new Date().toISOString().slice(0,10);$('pickupDate').min=iso;$('returnDate').min=iso;
  $('pickupDate').addEventListener('change',()=>{$('returnDate').min=$('pickupDate').value||iso;if($('returnDate').value&&$('returnDate').value<=$('pickupDate').value)$('returnDate').value='';updatePriceAndTotal()});
}
function initMenu(){
  const button=document.querySelector('.menu-btn'),nav=document.querySelector('.nav');
  button.addEventListener('click',()=>{const open=nav.classList.toggle('open');button.setAttribute('aria-expanded',String(open))});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
}
document.addEventListener('DOMContentLoaded',async()=>{
  $('year').textContent=new Date().getFullYear();initDates();initMenu();
  $('carId').addEventListener('change',updatePriceAndTotal);$('pickupDate').addEventListener('input',updatePriceAndTotal);$('returnDate').addEventListener('input',updatePriceAndTotal);$('booking-form').addEventListener('submit',handleSubmit);
  try{await loadCars()}catch(e){showMessage(e.message,'error')}
});
