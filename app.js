// ==============================
// Supabase
// ==============================
const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================
// Global
// ==============================
let currentTab = "bekleyen";
let currentPage = 1;
let selectedOrder = null;

const TABLE = "esin_siparisler";
const WH_KARGOLA = "https://n8n.ozkanceylan.uk/webhook/kargola_esin";
const WH_BARKOD  = "https://n8n.ozkanceylan.uk/webhook/barkod_esin";
const WH_IPTAL   = "https://n8n.ozkanceylan.uk/webhook/kargo_iptal_esin";

// anti double-submit bellek işaretleri
const busy = { kargola: new Set(), barkod: new Set() };

// ==============================
// B-stili confirm modal + toast
// ==============================
function confirmModal({title, text, confirmText="Onayla", cancelText="Vazgeç"}){
  return new Promise(res=>{
    const root = document.getElementById("alertRoot");
    const wrap = document.createElement("div");
    wrap.className = "alert-backdrop";
    wrap.innerHTML = `
      <div class="alert-card">
        <div class="alert-title">${title}</div>
        <div class="alert-text">${text.replace(/\n/g,"<br>")}</div>
        <div class="alert-actions">
          <button class="btn-ghost" id="aCancel">${cancelText}</button>
          <button class="btn-brand" id="aOk">${confirmText}</button>
        </div>
      </div>`;
    root.appendChild(wrap);
    wrap.querySelector("#aCancel").onclick=()=>{ root.removeChild(wrap); res(false); };
    wrap.querySelector("#aOk").onclick=()=>{ root.removeChild(wrap); res(true); };
  });
}

function toast(msg, ms=2600){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.remove(); }, ms);
}

// ==============================
// Logout
// ==============================
function logout(){ localStorage.clear(); location.href="login.html"; }

// ==============================
// Load Orders
// ==============================
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){ currentPage=1; tbody.innerHTML=""; }

  let q = db.from(TABLE).select("*");

  if(currentTab==="bekleyen")   q = q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q = q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="iptal")      q = q.eq("kargo_durumu","İptal");

  q = q.order("siparis_no",{ascending:false}).range(0, currentPage*20-1);

  const { data, error } = await q;
  if(error){ tbody.innerHTML=`<tr><td colspan="7">HATA: ${error.message}</td></tr>`; return; }
  renderTable(data);
}

function renderTable(rows){
  const tbody = document.getElementById("ordersBody");
  if(!rows || rows.length===0){ tbody.innerHTML = `<tr><td colspan="7">Kayıt bulunamadı</td></tr>`; return; }
  tbody.innerHTML = "";
  rows.forEach(o=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.siparis_no}</td>
      <td>${o.ad_soyad}</td>
      <td>${parseProduct(o.urun_bilgisi)}</td>
      <td>${o.toplam_tutar} TL</td>
      <td>${o.kargo_durumu}</td>
      <td>${o.kargo_takip_kodu ?? "-"}</td>
      <td><button class="btn-open">Aç</button></td>`;
    tr.addEventListener("click", e=>{ if(!e.target.classList.contains("btn-open")) openOrder(o.siparis_no); });
    tr.querySelector(".btn-open").addEventListener("click", e=>{ e.stopPropagation(); openOrder(o.siparis_no); });
    tbody.appendChild(tr);
  });
}

function parseProduct(v){
  if(!v) return "-";
  try{ if(v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", "); }catch{}
  return v;
}

// ==============================
// Modal open/close
// ==============================
async function openOrder(id){
  const { data, error } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(error || !data) return alert("Sipariş bulunamadı!");
  selectedOrder = data;
  renderDetailsView();
  document.getElementById("orderModal").style.display="flex";
}
function closeModal(){ document.getElementById("orderModal").style.display="none"; }

// ==============================
// Details view + button visibility
// ==============================
function renderDetailsView(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan Tel:</b> ${d.siparis_tel}</p>
    <p><b>Müşteri Tel:</b> ${d.musteri_tel}</p>
    <p><b>Adres:</b> ${d.adres}</p>
    <p><b>Şehir / İlçe:</b> ${d.sehir} / ${d.ilce}</p>
    <p><b>Ürün:</b> ${parseProduct(d.urun_bilgisi)}</p>
    <p><b>Adet:</b> ${d.kargo_adet ?? "-"}</p>
    <p><b>KG:</b> ${d.kargo_kg ?? "-"}</p>
    <p><b>Tutar:</b> ${d.toplam_tutar} TL</p>
    <p><b>Ödeme:</b> ${d.odeme_sekli}</p>
    <p><b>Sipariş Alan:</b> ${d.siparis_alan ?? "-"}</p>
    <p><b>Not:</b> ${d.notlar ?? "-"}</p>
  `;

  const isIptal = d.kargo_durumu==="İptal";
  const isKargolandi = d.kargo_durumu==="Kargolandı";

  document.getElementById("btnPrepare").style.display = d.kargo_durumu==="Bekliyor"   ? "inline-block":"none";
  document.getElementById("btnCargo").style.display   = d.kargo_durumu==="Hazırlandı" ? "inline-block":"none";
  document.getElementById("btnBarcode").style.display = isKargolandi ? "inline-block":"none";

  const editBtn = document.querySelector("#actionButtons .btn-warning");
  if(editBtn){ editBtn.style.display = isKargolandi ? "none" : "inline-block"; }

  document.getElementById("actionButtons").style.display = isIptal ? "none":"flex";
  document.getElementById("restoreButtons").style.display= isIptal ? "flex":"none";
  document.getElementById("editButtons").style.display   = "none";
  document.getElementById("cancelForm").style.display    = "none";
}

// ==============================
// Edit mode
// ==============================
function enterEditMode(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <div class="edit-grid">
      <div class="form-group">
        <label>Ad Soyad</label><input id="ad_soyad" value="${d.ad_soyad ?? ""}">
      </div>
      <div class="form-group">
        <label>Sipariş Alan Tel</label><input id="siparis_tel" value="${d.siparis_tel ?? ""}">
      </div>
      <div class="form-group">
        <label>Müşteri Tel</label><input id="musteri_tel" value="${d.musteri_tel ?? ""}">
      </div>
      <div class="form-group full-row">
        <label>Adres</label><textarea id="adres">${d.adres ?? ""}</textarea>
      </div>
      <div class="form-group">
        <label>Şehir</label><input id="sehir" value="${d.sehir ?? ""}">
      </div>
      <div class="form-group">
        <label>İlçe</label><input id="ilce" value="${d.ilce ?? ""}">
      </div>
      <div class="form-group">
        <label>Kargo Adet</label><input id="kargo_adet" value="${d.kargo_adet ?? ""}">
      </div>
      <div class="form-group">
        <label>Kargo KG</label><input id="kargo_kg" value="${d.kargo_kg ?? ""}">
      </div>
      <div class="form-group full-row">
        <label>Ürün</label><textarea id="urun_bilgisi">${d.urun_bilgisi ?? ""}</textarea>
      </div>
      <div class="form-group">
        <label>Tutar</label><input id="toplam_tutar" value="${d.toplam_tutar ?? ""}">
      </div>
      <div class="form-group">
        <label>Ödeme</label><input id="odeme_sekli" value="${d.odeme_sekli ?? ""}">
      </div>
      <div class="form-group full-row">
        <label>Not</label><textarea id="notlar">${d.notlar ?? ""}</textarea>
      </div>
    </div>`;
  document.getElementById("actionButtons").style.display = "none";
  document.getElementById("editButtons").style.display = "flex";
}

async function saveEdit(){
  const updated = {
    ad_soyad: ad_soyad.value,
    siparis_tel: siparis_tel.value,
    musteri_tel: musteri_tel.value,
    adres: adres.value,
    sehir: sehir.value,
    ilce: ilce.value,
    kargo_adet: kargo_adet.value,
    kargo_kg: kargo_kg.value,
    urun_bilgisi: urun_bilgisi.value,
    toplam_tutar: toplam_tutar.value,
    odeme_sekli: odeme_sekli.value,
    notlar: notlar.value
  };
  await db.from(TABLE).update(updated).eq("siparis_no", selectedOrder.siparis_no);
  toast("Değişiklikler kaydedildi");
  closeModal(); loadOrders(true);
}
function cancelEdit(){ renderDetailsView(); document.getElementById("editButtons").style.display="none"; document.getElementById("actionButtons").style.display="flex"; }

// ==============================
// Hazırla
// ==============================
async function markPrepared(){
  await db.from(TABLE).update({kargo_durumu:"Hazırlandı"}).eq("siparis_no", selectedOrder.siparis_no);
  toast("Sipariş Hazırlandı olarak işaretlendi");
  closeModal(); loadOrders(true);
}

// ==============================
// Kargola (B stili uyarı + 1 dk sadece bu sipariş kilidi)
// ==============================
async function sendToCargo(){
  const ok = await confirmModal({
    title: "Kargoya Gönder",
    text: "Bu sipariş KARGOLANDI olarak işaretlenecek ve DHL'e iletilecektir.\nBu işlem normal şartlarda geri alınamaz ve iptal durumunda kargo firması ek ücret talep edebilir.",
    confirmText: "Evet, Gönder", cancelText: "Vazgeç"
  });
  if(!ok) return;

  const key = selectedOrder.siparis_no;
  if(busy.kargola.has(key)){ toast("Bu sipariş için işlem zaten gönderildi!"); return; }
  busy.kargola.add(key);

  try{
    await fetch(WH_KARGOLA, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(selectedOrder) });
    toast("Kargoya gönderildi! Güncellenmesi 1 dakikayı bulabilir.");
    const btn = document.getElementById("btnCargo");
    if(btn){ btn.disabled = true; setTimeout(()=>{ btn.disabled=false; }, 60000); }
  }catch(e){
    toast("Gönderim sırasında hata oluştu");
  }finally{
    setTimeout(()=>busy.kargola.delete(key), 60000);
  }
}

// ==============================
// Barkod
// ==============================
async function printBarcode(){
  const ok = await confirmModal({
    title: "Barkod Kes",
    text: "Barkod sadece bir kez yazdırılabilir. Lütfen yazıcının açık olduğunu kontrol edin.",
    confirmText: "Evet, Yazdır", cancelText: "İptal"
  });
  if(!ok) return;

  const key = selectedOrder.siparis_no;
  if(busy.barkod.has(key)){ toast("Bu sipariş için barkod isteği zaten aktif."); return; }
  busy.barkod.add(key);

  try{
    await fetch(WH_BARKOD, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(selectedOrder) });
    toast("Barkod isteği gönderildi.");
  }catch(e){
    toast("Barkod gönderiminde hata oluştu");
  }finally{
    setTimeout(()=>busy.barkod.delete(key), 20000);
  }
}

// ==============================
// İptal
// ==============================
function openCancelForm(){
  document.getElementById("cancelForm").style.display="block";
  document.getElementById("actionButtons").style.display="none";
  document.getElementById("editButtons").style.display="none";
}
function cancelCancelForm(){
  document.getElementById("cancelForm").style.display="none";
  document.getElementById("actionButtons").style.display="flex";
}
async function confirmCancel(){
  const reason = document.getElementById("iptalInput").value.trim();
  if(!reason) return toast("İptal nedeni gerekli");

  await fetch(WH_IPTAL, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ ...selectedOrder, reason }) });

  await db.from(TABLE).update({ kargo_durumu:"İptal", iptal_nedeni: reason, iptal_tarihi: new Date().toISOString() }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Sipariş iptal edildi");
  closeModal(); loadOrders(true);
}

// ==============================
// Restore
// ==============================
async function restoreOrder(){
  await db.from(TABLE).update({ kargo_durumu:"Bekliyor", iptal_nedeni:null, iptal_tarihi:null }).eq("siparis_no", selectedOrder.siparis_no);
  toast("Sipariş geri alındı");
  closeModal(); loadOrders(true);
}

// ==============================
// Tab/Arama/Load more
// ==============================
function setTab(tab){
  currentTab = tab;
  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  document.getElementById(`tab_${tab}`).classList.add("active");
  loadOrders(true);
}
function loadMore(){ currentPage++; loadOrders(false); }

async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);
  const { data } = await db.from(TABLE).select("*").or(`
    siparis_no.eq.${q},
    ad_soyad.ilike.%${q}%,
    siparis_tel.ilike.%${q}%,
    musteri_tel.ilike.%${q}%`);
  renderTable(data);
}
function clearSearch(){ document.getElementById("searchInput").value=""; loadOrders(true); }

// ==============================
// Mobile menu
// ==============================
function toggleMenu(){ document.querySelector(".sidebar").classList.toggle("open"); }

// ==============================
// Init
// ==============================
loadOrders(true);
