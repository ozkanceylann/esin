/* ============================================================
   CONFIG YÜKLENENE KADAR BEKLE
============================================================ */
await window.waitConfig();

/* ============================================================
   SUPABASE
============================================================ */
const SUPABASE_URL = "https://jarsxtpqzqzhlshpmgot.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcnN4dHBxenF6aGxzaHBtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODExMTcsImV4cCI6MjA3Nzg1NzExN30.98oYONSkb8XSDrfGW2FxhFmt2BLB5ZRo3Ho50GhZYgE";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================================================
   MARKA AYARLARI
============================================================ */
const TABLE         = CONFIG.table;
const WH_KARGOLA    = CONFIG.webhooks.kargola;
const WH_BARKOD     = CONFIG.webhooks.barkod;
const WH_IPTAL      = CONFIG.webhooks.iptal;
const WH_SEHIR_ILCE = CONFIG.webhooks.sehir_ilce;

/* ============================================================
   GLOBAL STATE
============================================================ */
let currentTab = "bekleyen";
let currentPage = 1;
let selectedOrder = null;

const busy = { kargola: new Set(), barkod: new Set() };



/* ============================================================
   UI HELPERS
============================================================ */
function toast(msg, ms=2500){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function confirmModal({title, text, confirmText="Onayla", cancelText="Vazgeç"}){
  return new Promise(res=>{
    const root = document.getElementById("alertRoot");
    const wrap = document.createElement("div");
    wrap.className = "alert-backdrop";
    wrap.innerHTML = `
      <div class="alert-card">
        <div class="alert-title">${title}</div>
        <div class="alert-text">${(text||"").replace(/\n/g,"<br>")}</div>
        <div class="alert-actions">
          <button class="btn-ghost" id="cCancel">${cancelText}</button>
          <button class="btn-brand" id="cOk">${confirmText}</button>
        </div>
      </div>`;
    root.appendChild(wrap);
    wrap.querySelector("#cCancel").onclick = ()=>{ wrap.remove(); res(false); };
    wrap.querySelector("#cOk").onclick     = ()=>{ wrap.remove(); res(true); };
  });
}

function logout(){
  localStorage.clear();
  location.href = "login.html";
}

/* ============================================================
   LİSTELEME
============================================================ */
async function loadOrders(reset=false){
  const tbody = document.getElementById("ordersBody");
  if(reset){
    currentPage = 1;
    tbody.innerHTML = "";
  }

  let q = db.from(TABLE).select("*");

  if(currentTab==="bekleyen")   q = q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q = q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="tamamlandi") q = q.eq("kargo_durumu","Tamamlandı");
  if(currentTab==="sorunlu")    q = q.eq("kargo_durumu","Sorunlu");
  if(currentTab==="iptal")      q = q.eq("kargo_durumu","İptal");

  q = q.order("siparis_no", { ascending:false })
       .range(0, currentPage*20 - 1);

  const { data, error } = await q;
  if(error){
    tbody.innerHTML = `<tr><td colspan="7">HATA: ${error.message}</td></tr>`;
    return;
  }

  renderTable(data);
}

function renderTable(rows){
  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";

  if(!rows || rows.length===0){
    tbody.innerHTML = `<tr><td colspan="7">Kayıt bulunamadı</td></tr>`;
    return;
  }

  rows.forEach(o=>{
    const tr = document.createElement("tr");

   const durumText = ["kargolandi", "tamamlandi", "sorunlu"].includes(currentTab)
    ? (o.shipmentStatus ?? "—")
    : o.kargo_durumu;

    const isTrackingTab = ["kargolandi", "tamamlandi", "sorunlu"].includes(currentTab);

const actionBtn = isTrackingTab
  ? `<button class="btn-open" onclick="event.stopPropagation(); openTrackingUrl('${o.kargo_takip_url ?? ""}')">Sorgula</button>`
  : `<button class="btn-open">Aç</button>`;


    tr.innerHTML = `
      <td>${o.siparis_no}</td>
      <td>${o.ad_soyad}</td>
      <td>${parseProduct(o.urun_bilgisi)}</td>
      <td>${o.toplam_tutar} TL</td>
      <td>${durumText}</td>
      <td>${o.kargo_takip_kodu ?? "-"}</td>
      <td>${actionBtn}</td>
    `;

    tr.addEventListener("click", (e)=>{
      if(e.target.classList.contains("btn-open")) return;
      openOrder(o.siparis_no);
    });

    tbody.appendChild(tr);
  });
}

function parseProduct(v){
  if(!v) return "-";
  try{
    if(v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", ");
  }catch{}
  return v;
}

/* ============================================================
   KARGO SORGULAMA
============================================================ */
function openTrackingUrl(url){
  if(!url) return toast("Kargo sorgulama linki yok.");
  window.open(url, "_blank");
}

/* ============================================================
   DETAY
============================================================ */
async function openOrder(id){
  const { data } = await db.from(TABLE).select("*").eq("siparis_no", id).single();
  if(!data) return toast("Sipariş bulunamadı!");
  selectedOrder = data;
  renderDetails();
  document.getElementById("orderModal").style.display = "flex";
}

function closeModal(){ 
  document.getElementById("orderModal").style.display = "none"; 
}

function renderDetails() {
  const d = selectedOrder;
   
  /* — ÖNCE TÜM BUTONLARI RESETLE — */
  document.querySelectorAll("#actionButtons button").forEach(btn => {
    btn.style.display = "inline-block";
  });

  /* — DETAY HTML — */
  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan Tel:</b> ${d.siparis_tel}</p>
    <p><b>Müşteri Tel:</b> ${d.musteri_tel}</p>
    <p><b>Adres:</b> ${d.adres}</p>

    <p>
      <b>Şehir / İlçe:</b> ${d.sehir} / ${d.ilce}
      <button class="btn-mini" onclick="queryCityDistrictCodes()">Sor</button>
      <br><small>Kodlar: ${d.sehir_kodu ?? "-"} / ${d.ilce_kodu ?? "-"}</small>
    </p>

    <p><b>Ürün:</b> ${parseProduct(d.urun_bilgisi)}</p>
    <p><b>Adet:</b> ${d.kargo_adet ?? "-"}</p>
    <p><b>KG:</b> ${d.kargo_kg ?? "-"}</p>
    <p><b>Tutar:</b> ${d.toplam_tutar} TL</p>
    <p><b>Ödeme:</b> ${d.odeme_sekli}</p>
    <p><b>Not:</b> ${d.notlar ?? "-"}</p>
  `;

  /* ============================================================
      SOR BUTONU KURAL — SADECE Bekliyor ve Hazırlandı GÖRÜNECEK
  ============================================================ */
  try {
    const sorBtn = document.querySelector(".btn-mini");
    if (sorBtn) {
      if (["Bekliyor", "Hazırlandı"].includes(d.kargo_durumu)) {
        sorBtn.style.display = "inline-block";
      } else {
        sorBtn.style.display = "none";
      }
    }
  } catch (e) {}

  /* ============================================================
      HAZIRLANDI DURUMUNDA DÜZENLE BUTONUNU GİZLE
  ============================================================ */
  try {
    const duzenleBtn = [...document.querySelectorAll("#actionButtons button")]
      .find(btn => btn.textContent.trim() === "Düzenle");

    if (duzenleBtn && d.kargo_durumu === "Hazırlandı") {
      duzenleBtn.style.display = "none";
    }
  } catch (e) {}

  /* ============================================================
      BEKLİYOR BUTONU KURAL — 
      Bekleyen ekranında GÖRÜNMEYECEK
      Hazırlandı ekranında GÖRÜNECEK
      Diğer durumlarda GÖRÜNMEYECEK
  ============================================================ */
  try {
    const bekliyorBtn = document.getElementById("btnWaiting");

    if (bekliyorBtn) {
      if (d.kargo_durumu === "Bekliyor") {
        bekliyorBtn.style.display = "none"; // bekleyen ekranda gereksiz
      }
      else if (d.kargo_durumu === "Hazırlandı") {
        bekliyorBtn.style.display = "inline-block"; // hazırlandı → geri al
      }
      else {
        bekliyorBtn.style.display = "none"; // diğer durumlarda gizli
      }
    }
  } catch (e) {}

  /* ============================================================
      DİĞER DURUMLAR (KARGO / TAMAM / İPTAL)
  ============================================================ */

  const iptal = d.kargo_durumu === "İptal";
  const kargo = d.kargo_durumu === "Kargolandı";
  const tamam = d.kargo_durumu === "Tamamlandı";

  /* Bekliyor → Hazırla butonu */
  document.getElementById("btnPrepare").style.display =
    (d.kargo_durumu === "Bekliyor") ? "inline-block" : "none";

  /* Hazırlandı → Kargola butonu */
  document.getElementById("btnCargo").style.display =
    (d.kargo_durumu === "Hazırlandı") ? "inline-block" : "none";

  /* Kargolandı → Barkod Kes */
  document.getElementById("btnBarcode").style.display =
    kargo ? "inline-block" : "none";

  /* — TAMAMLANAN → sadece kapat — */
  if (tamam) {
    document.querySelectorAll("#actionButtons button").forEach(btn => btn.style.display = "none");
    document.querySelector("#actionButtons .btn-close").style.display = "inline-block";
  }

  /* — İPTAL DURUMU — */
  document.getElementById("actionButtons").style.display = iptal ? "none" : "flex";
  document.getElementById("restoreButtons").style.display = iptal ? "flex" : "none";

  document.getElementById("editButtons").style.display = "none";
  document.getElementById("cancelForm").style.display = "none";
}


/* ============================================================
   ŞEHİR/İLÇE KODU SOR  (ORİJİNAL - WEBHOOK İLE)
============================================================ */
async function queryCityDistrictCodes(){
  toast("Kodlar sorgulanıyor...");

  const res = await fetch(WH_SEHIR_ILCE, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(selectedOrder)
  });

  if(!res.ok) return toast("Kod bulunamadı");

  const d = await res.json();

  await db.from(TABLE)
    .update({ sehir_kodu:d.sehir_kodu, ilce_kodu:d.ilce_kodu })
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Kodlar güncellendi");
  openOrder(selectedOrder.siparis_no);
}

/* ============================================================
   DÜZENLEME
============================================================ */
function enterEditMode(){
  const d = selectedOrder;
  document.getElementById("orderDetails").innerHTML = `
    <div class="edit-grid">
      <div><label>Ad Soyad</label><input id="ad_soyad" value="${d.ad_soyad??""}"></div>
      <div><label>Sipariş Tel</label><input id="siparis_tel" value="${d.siparis_tel??""}"></div>
      <div><label>Müşteri Tel</label><input id="musteri_tel" value="${d.musteri_tel??""}"></div>
      <div class="full-row"><label>Adres</label><textarea id="adres">${d.adres??""}</textarea></div>
      <div><label>Şehir</label><input id="sehir" value="${d.sehir??""}"></div>
      <div><label>İlçe</label><input id="ilce" value="${d.ilce??""}"></div>
      <div><label>Kargo Adet</label><input id="kargo_adet" value="${d.kargo_adet??""}"></div>
      <div><label>Kargo KG</label><input id="kargo_kg" value="${d.kargo_kg??""}"></div>
      <div class="full-row"><label>Ürün</label><textarea id="urun_bilgisi">${d.urun_bilgisi??""}</textarea></div>
      <div><label>Tutar</label><input id="toplam_tutar" value="${d.toplam_tutar??""}"></div>
      <div><label>Ödeme</label><input id="odeme_sekli" value="${d.odeme_sekli??""}"></div>
      <div class="full-row"><label>Not</label><textarea id="notlar">${d.notlar??""}</textarea></div>
    </div>`;
  document.getElementById("actionButtons").style.display = "none";
  document.getElementById("editButtons").style.display = "flex";
}

async function saveEdit(){
  const updated = {
    ad_soyad: ad_soyad.value, siparis_tel: siparis_tel.value, musteri_tel: musteri_tel.value,
    adres: adres.value, sehir: sehir.value, ilce: ilce.value,
    kargo_adet: kargo_adet.value, kargo_kg: kargo_kg.value,
    urun_bilgisi: urun_bilgisi.value, toplam_tutar: toplam_tutar.value,
    odeme_sekli: odeme_sekli.value, notlar: notlar.value
  };
  await db.from(TABLE).update(updated).eq("siparis_no", selectedOrder.siparis_no);
  toast("Kaydedildi");
  closeModal();
  loadOrders(true);
}

function cancelEdit(){
  renderDetails();
  document.getElementById("editButtons").style.display = "none";
  document.getElementById("actionButtons").style.display = "flex";
}

/* ============================================================
   DURUMLAR
============================================================ */
async function setWaiting(){
  await db.from(TABLE)
    .update({ kargo_durumu: "Bekliyor" })
    .eq("siparis_no", selectedOrder.siparis_no);
  toast("Sipariş Bekliyor olarak güncellendi");
  closeModal();
  loadOrders(true);
}

async function markPrepared(){
  await db.from(TABLE)
    .update({ kargo_durumu:"Hazırlandı" })
    .eq("siparis_no", selectedOrder.siparis_no);

  printSiparis(selectedOrder);

  toast("Sipariş Hazırlandı");
  closeModal();
  loadOrders(true);
}

async function sendToCargo(){

  /* — Queen Tarzı UYARI PENCERESİ — */
  const ok = await confirmModal({
    title: "Kargoya Gönder",
    text: `Bu sipariş KARGOLANDI olarak işaretlenecek ve DHL'e iletilecektir.
Bu işlem normal şartlarda geri alınamaz ve iptal durumunda kargo firması ek ücret talep edebilir.`,
    confirmText: "Evet, Kargola",
    cancelText: "Vazgeç"
  });

  if(!ok) return;

  const key = selectedOrder.siparis_no;
  if(busy.kargola.has(key)) return toast("Bu sipariş zaten işleniyor.");
  busy.kargola.add(key);

  try{
    await fetch(WH_KARGOLA, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(selectedOrder)
    });
    toast("Kargoya gönderildi.");
  }catch(e){
    toast("Gönderim hatası");
  }finally{
    setTimeout(()=>busy.kargola.delete(key), 20000);
  }
}

async function printBarcode(){
  const ok = await confirmModal({
    title:"Barkod Kes",
    text:"Barkod isteği gönderilecek.",
    confirmText:"Gönder",
    cancelText:"Vazgeç"
  });
  if(!ok) return;

  const key = selectedOrder.siparis_no;
  if(busy.barkod.has(key)) return toast("Barkod zaten bekliyor");
  busy.barkod.add(key);

  try{
    await fetch(WH_BARKOD, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(selectedOrder)
    });
    toast("Barkod gönderildi");
  }catch(e){
    toast("Barkod hatası!");
  }finally{
    setTimeout(()=>busy.barkod.delete(key), 20000);
  }
}

/* ============================================================
   İPTAL / GERİ AL
============================================================ */
function openCancelForm(){
  document.getElementById("cancelForm").style.display = "block";
  document.getElementById("actionButtons").style.display = "none";
}

function cancelCancelForm(){
  document.getElementById("cancelForm").style.display = "none";
  document.getElementById("actionButtons").style.display = "flex";
}

async function confirmCancel(){

  /* — QUEEN TARZI UYARI — */
  const modalOk = await confirmModal({
    title: "Kargolanmış Siparişi İptal Et",
    text: `Bu sipariş kargo firmasına gönderilmiş durumda.
İptal işlemi sonucunda kargo firması tarafından ek ücretler talep edilebilir.

İptal Nedeni (zorunlu)`,
    confirmText: "İptal Et",
    cancelText: "Vazgeç"
  });

  if(!modalOk) return;

  const reason = document.getElementById("iptalInput").value.trim();
  if(!reason) return toast("İptal nedeni gerekli");

  await fetch(WH_IPTAL, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ ...selectedOrder, reason })
  });

  await db.from(TABLE).update({
    kargo_durumu:"İptal",
    iptal_nedeni: reason,
    iptal_tarihi: new Date().toISOString()
  }).eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş iptal edildi");
  closeModal();
  loadOrders(true);
}

async function restoreOrder(){
  await db.from(TABLE).update({
    kargo_durumu:"Bekliyor",
    iptal_nedeni:null,
    iptal_tarihi:null
  }).eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş geri alındı");
  closeModal();
  loadOrders(true);
}

/* ============================================================
   ARAMA
============================================================ */
async function searchOrders(){
  const q = document.getElementById("searchInput").value.trim();
  if(!q) return loadOrders(true);

  const { data } = await db.from(TABLE).select("*").or(`
    siparis_no.eq.${q},
    ad_soyad.ilike.%${q}%,
    siparis_tel.ilike.%${q}%,
    musteri_tel.ilike.%${q}%,
    adres.ilike.%${q}%,
    kargo_takip_kodu.ilike.%${q}%
  `);
  renderTable(data);
}

function clearSearch(){
  document.getElementById("searchInput").value="";
  loadOrders(true);
}

/* ============================================================
   TAB / LOAD MORE / MOBİL MENÜ
============================================================ */
function setTab(tab){
  currentTab = tab;
  document.querySelectorAll(".menu li").forEach(li=>li.classList.remove("active"));
  const el = document.getElementById(`tab_${tab}`);
  if(el) el.classList.add("active");
  loadOrders(true);
}

function loadMore(){
  currentPage++;
  loadOrders(false);
}

function toggleMenu(){
  document.querySelector(".sidebar").classList.toggle("open");
}

document.addEventListener("click", e=>{
  const sidebar = document.querySelector(".sidebar");
  const btn = document.querySelector(".mobile-menu-btn");
  if(!sidebar.classList.contains("open")) return;
  if(sidebar.contains(e.target) || btn.contains(e.target)) return;
  sidebar.classList.remove("open");
});

/* ============================================================
   FİŞ (Adisyon)
============================================================ */
function printSiparis(order){
  const w = window.open("adisyon_print.html", "_blank");
  if(!w){ toast("Pop-up engellendi. Lütfen bu site için pop-up izni verin."); return; }

  const html = `
    <div style="font-size:12px">
      <div><b>No:</b> ${order.siparis_no}</div>
      <div><b>İsim:</b> ${order.ad_soyad}</div>
      <div><b>Tel:</b> ${order.musteri_tel ?? ""}</div>
      <div><b>Adres:</b> ${order.adres ?? ""}</div>
      <div><b>Şehir/İlçe:</b> ${order.sehir ?? ""} / ${order.ilce ?? ""}</div>
      <div style="margin:6px 0;border-bottom:1px dashed #000;"></div>
      <div><b>Ürünler:</b> ${parseProduct(order.urun_bilgisi)}</div>
      <div><b>Adet:</b> ${order.kargo_adet ?? "-"}</div>
      <div><b>KG:</b> ${order.kargo_kg ?? "-"}</div>
      <div><b>Tutar:</b> ${order.toplam_tutar} TL</div>
      <div><b>Ödeme:</b> ${order.odeme_sekli ?? "-"}</div>
      <div><b>Not:</b> ${order.notlar ?? "-"}</div>
    </div>`;

  const inject = ()=>{
    try{
      const el = w.document.getElementById("content");
      if(el){
        el.innerHTML = html;
        if(typeof w.doPrint === "function") w.doPrint();
        else w.print();
        return true;
      }
      return false;
    }catch{ return false; }
  };

  let tries = 0;
  const t = setInterval(()=>{
    tries++;
    if(inject() || tries>40) clearInterval(t);
  }, 100);
}

/* ============================================================
   GLOBAL EXPORT
============================================================ */
Object.assign(window, {
  logout,
  loadOrders,
  setTab,
  searchOrders,
  clearSearch,
  toggleMenu,

  openOrder,
  closeModal,

  openTrackingUrl,

  setWaiting,
  markPrepared,
  sendToCargo,
  printBarcode,

  enterEditMode,
  saveEdit,
  cancelEdit,

  openCancelForm,
  cancelCancelForm,
  confirmCancel,
  restoreOrder,

  queryCityDistrictCodes,

  printSiparis,
});

/* ============================================================
   BAŞLAT
============================================================ */
loadOrders(true);

