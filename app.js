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
   REFERANS VERİLER (ŞEHİR / İLÇE)
============================================================ */
const cityCache = [];
const districtCache = new Map();

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
const PAGE_SIZE = 10;
let selectedOrder = null;

const busy = { kargola: new Set(), barkod: new Set() };



/* ============================================================
   UI HELPERS
============================================================ */
function getColumnCount(){
  return currentTab === "bekleyen" ? 6 : 7;
}

function renderTableHeader(){
  const head = document.getElementById("ordersHeadRow");
  if(!head) return;

  head.innerHTML = currentTab === "bekleyen"
    ? `
      <th>No</th>
      <th>İsim</th>
      <th>Ürün</th>
      <th>Tutar</th>
      <th>Durum</th>
      <th>Sipariş Alan</th>
    `
    : `
      <th>No</th>
      <th>İsim</th>
      <th>Ürün</th>
      <th>Tutar</th>
      <th>Durum</th>
      <th>Kargo Kod</th>
      <th>Aç / Sorgula</th>
    `;
}

function toast(msg, ms=2500){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function toggleLoadMore(visible){
  const btn = document.getElementById("loadMoreBtn");
  if(!btn) return;
  btn.style.display = visible ? "block" : "none";
}

// Sidebar menü tıklanınca otomatik kapanması (mobil)
document.querySelectorAll(".sidebar .menu li").forEach(item => {
  item.addEventListener("click", () => {
    const sidebar = document.querySelector(".sidebar");
    if (sidebar.classList.contains("open")) {
      sidebar.classList.remove("open"); // KAPAT
    }
  });
});

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

  renderTableHeader();

  let q = db.from(TABLE).select("*", { count: "exact" });

  if(currentTab==="bekleyen")   q = q.eq("kargo_durumu","Bekliyor");
  if(currentTab==="hazirlandi") q = q.eq("kargo_durumu","Hazırlandı");
  if(currentTab==="kargolandi") q = q.eq("kargo_durumu","Kargolandı");
  if(currentTab==="tamamlandi") q=q.eq("shipmentStatusCode",5);
  if(currentTab==="sorunlu")    q=q.in("shipmentStatusCode",[6,7]); // 6: sorunlu, 7: iade
  if(currentTab==="iptal")      q = q.eq("kargo_durumu","İptal");

  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = currentPage * PAGE_SIZE - 1;

  q = q.order("siparis_no", { ascending:false })
       .range(start, end);

  const { data, error, count } = await q;
  if(error){
    tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">HATA: ${error.message}</td></tr>`;
    toggleLoadMore(false);
    return;
  }

  const hasMore = typeof count === "number"
    ? count > currentPage * PAGE_SIZE
    : (data?.length === PAGE_SIZE);

  if(!reset && (!data || data.length === 0)){
    toggleLoadMore(false);
    return toast("Gösterilecek başka kayıt yok.");
  }

  renderTable(data, { append: !reset, hasMore });
}

function renderTable(rows, { append=false, hasMore } = {}){
  const tbody = document.getElementById("ordersBody");
  if(!tbody) return;

  if(!append) tbody.innerHTML = "";

  if(!rows || rows.length===0){
    if(!append) tbody.innerHTML = `<tr><td colspan="${getColumnCount()}">Kayıt bulunamadı</td></tr>`;
    toggleLoadMore(false);
    return;
  }

  rows.forEach(o=>{
    const tr = document.createElement("tr");

   const durumText = ["kargolandi", "tamamlandi", "sorunlu"].includes(currentTab)
    ? (o.shipmentStatus ?? "—")
    : o.kargo_durumu;

    const isTrackingTab = ["kargolandi", "tamamlandi", "sorunlu"].includes(currentTab);

    const isPendingTab = currentTab === "bekleyen";

  const isPreparedTab = currentTab === "hazirlandi";

  const actionBtn = isTrackingTab
    ? `<button class="btn-open" onclick="event.stopPropagation(); openTrackingUrl('${o.kargo_takip_url ?? ""}')">Sorgula</button>`
    : `<button class="btn-open">Aç</button>`;

  const errorPreview = isPreparedTab
    ? `<button class="error-chip" onclick="event.stopPropagation(); showErrorDetail(${JSON.stringify(o.gonder_hata_bilgisi ?? "")})" title="Detayı görmek için tıkla">
         <span class="error-chip__label">Hata</span>
         <span class="error-chip__text">${escapeHtml(shortenError(o.gonder_hata_bilgisi))}</span>
       </button>`
    : actionBtn;


    tr.innerHTML = isPendingTab
      ? `
        <td>${o.siparis_no}</td>
        <td>${o.ad_soyad}</td>
        <td>${parseProduct(o.urun_bilgisi)}</td>
        <td>${o.toplam_tutar} TL</td>
        <td>${durumText}</td>
        <td>${o.siparis_alan ?? "-"}</td>
      `
      : `
        <td>${o.siparis_no}</td>
        <td>${o.ad_soyad}</td>
        <td>${parseProduct(o.urun_bilgisi)}</td>
        <td>${o.toplam_tutar} TL</td>
        <td>${durumText}</td>
        <td>${o.kargo_takip_kodu ?? "-"}</td>
        <td>${errorPreview}</td>
      `;

    tr.addEventListener("click", (e)=>{
      if(e.target.classList.contains("btn-open") || e.target.closest(".error-chip")) return;
      openOrder(o.siparis_no);
    });

    tbody.appendChild(tr);
  });

  if(typeof hasMore === "boolean") toggleLoadMore(hasMore);
}

function parseProduct(v){
  if(!v) return "-";
  try{
    if(v.startsWith("[") && v.endsWith("]")) return JSON.parse(v).join(", ");
  }catch{}
  return v;
}

function shortenError(text, max=55){
  if(!text) return "Hata bilgisi yok";
  if(text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function escapeHtml(str=""){
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ============================================================
   KARGO SORGULAMA
============================================================ */
function openTrackingUrl(url){
  if(!url) return toast("Kargo sorgulama linki yok.");
  window.open(url, "_blank");
}

/* ============================================================
   İPTALDEN SİLME
============================================================ */

async function deleteCanceledOrder() {

  const ok = await confirmModal({
    title: "Siparişi Sil",
    text: "Bu sipariş tamamen listelerden kaldırılacaktır. İşlem geri alınamaz.\nOnaylıyor musunuz?",
    confirmText: "Sil",
    cancelText: "Vazgeç"
  });

  if (!ok) return;

  await db.from(TABLE)
    .update({ 
      kargo_durumu: "Silindi",
      iptal_nedeni: null,
      iptal_tarihi: new Date().toISOString()
    })
    .eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş silindi");
  closeModal();

  setTimeout(() => loadOrders(true), 1000);
}




/* ============================================================
   GÖNDERİM HATA DETAYI
============================================================ */
function showErrorDetail(message=""){
  const root = document.getElementById("alertRoot");
  const wrap = document.createElement("div");
  wrap.className = "alert-backdrop";

  const safeMessage = message || "Gönderim hatası kaydı bulunamadı.";

  wrap.innerHTML = `
    <div class="alert-card error-detail-card">
      <div class="alert-title">Gönderim Hata Bilgisi</div>
      <div class="alert-text">
        <textarea class="error-detail-text" readonly>${escapeHtml(safeMessage)}</textarea>
      </div>
      <div class="alert-actions">
        <button class="btn-brand" id="errorClose">Kapat</button>
      </div>
    </div>`;

  root.appendChild(wrap);

  wrap.querySelector("#errorClose").onclick = () => wrap.remove();
}

/* ============================================================
   API ÖNİZLEME POPUP (tek örnek, güvenli)
============================================================ */
function showApiResult(content) {
  const root = document.getElementById("alertRoot");
  // Önce var olanı sil (tek örnek olsun)
  root.querySelectorAll(".alert-backdrop").forEach(n => n.remove());

  const wrap = document.createElement("div");
  wrap.className = "alert-backdrop";
  // Backdrop tıklamasıyla kapansın (karta tıklamada kapanmasın)
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) wrap.remove();
  });

  // İçerik: PNG <img> ya da metin (ZPL/JSON)
  const isString = typeof content === "string";
  const html = isString && content.trim().startsWith("<img")
    ? content
    : `<textarea class="error-detail-text" readonly>${
        isString ? content : JSON.stringify(content, null, 2)
      }</textarea>`;

  wrap.innerHTML = `
    <div class="alert-card" style="pointer-events:auto">
      <div class="alert-title">API Yanıtı</div>
      <div class="alert-text">${html}</div>
      <div class="alert-actions">
        <button class="btn-brand" id="apiOkBtn">Kapat</button>
      </div>
    </div>
  `;
  root.appendChild(wrap);

  wrap.querySelector("#apiOkBtn").onclick = () => wrap.remove();
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

  /* — TÜM BUTONLARI RESETLE — */
  document.querySelectorAll("#actionButtons button").forEach(btn => {
    btn.style.display = "inline-block";
  });

  /* — DETAY HTML — */
  document.getElementById("orderDetails").innerHTML = `
    <p><b>No:</b> ${d.siparis_no}</p>
    <p><b>İsim:</b> ${d.ad_soyad}</p>
    <p><b>Sipariş Alan:</b> ${d.siparis_alan ?? "-"}</p>
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
      1) SOR BUTONU — SADECE Bekliyor & Hazırlandı
  ============================================================ */
  try {
    const sorBtn = document.querySelector(".btn-mini");
    if (sorBtn) {
      sorBtn.style.display = ["Bekliyor", "Hazırlandı"].includes(d.kargo_durumu)
        ? "inline-block"
        : "none";
    }
  } catch {}

  /* ============================================================
      2) DÜZENLE BUTONU
         Hazırlandı → Gizle
         Kargolandı → Gizle  ❗ (senin istediğin)
  ============================================================ */
  try {
    const duzenleBtn = document.querySelector("#actionButtons .btn-warning");
    if (duzenleBtn && ["Hazırlandı", "Kargolandı"].includes(d.kargo_durumu)) {
      duzenleBtn.style.display = "none";
    }
  } catch {}


  /* ============================================================
      3) BEKLİYOR BUTONU
         Bekleyen → gizle
         Hazırlandı → göster
         Diğer durumlar → gizle
  ============================================================ */
  try {
    const bekliyorBtn = document.getElementById("btnWaiting");

    if (bekliyorBtn) {
      if (d.kargo_durumu === "Bekliyor") {
        bekliyorBtn.style.display = "none";
      } else if (d.kargo_durumu === "Hazırlandı") {
        bekliyorBtn.style.display = "inline-block";
      } else {
        bekliyorBtn.style.display = "none";
      }
    }
  } catch {}


  /* ============================================================
      4) DİĞER BUTONLAR
  ============================================================ */

  const iptal = d.kargo_durumu === "İptal";
  const kargo = d.kargo_durumu === "Kargolandı";
  const tamam = d.kargo_durumu === "Tamamlandı";

  // Bekleyeni → Hazırla
  document.getElementById("btnPrepare").style.display =
    d.kargo_durumu === "Bekliyor" ? "inline-block" : "none";

  // Hazırlandı → Kargola
  document.getElementById("btnCargo").style.display =
    d.kargo_durumu === "Hazırlandı" ? "inline-block" : "none";

  // Kargolandı → Barkod kes
  document.getElementById("btnBarcode").style.display =
    kargo ? "inline-block" : "none";

  // Tamamlandı → butonları kapat, sadece kapat butonu açık kalsın
  if (tamam) {
    document.querySelectorAll("#actionButtons button").forEach(btn => {
      btn.style.display = "none";
    });
    document.querySelector("#actionButtons .btn-close").style.display = "inline-block";
  }

  // İptal → tüm actionButtons gizli, restoreButtons açık
  document.getElementById("actionButtons").style.display = iptal ? "none" : "flex";
  document.getElementById("restoreButtons").style.display = iptal ? "flex" : "none";

  // edit mode kapanmalı
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
   ŞEHİR / İLÇE REFERANSI
============================================================ */
async function loadCities(){
  if(cityCache.length) return cityCache;

  const { data, error } = await db
    .from("sehir")
    .select("id, name")
    .order("name", { ascending:true });

  if(error){
    toast("Şehir listesi alınamadı");
    return [];
  }

  cityCache.splice(0, cityCache.length, ...(data || []));
  return cityCache;
}

async function loadDistricts(cityId){
  if(!cityId) return [];
  if(districtCache.has(cityId)) return districtCache.get(cityId) || [];

  const { data, error } = await db
    .from("ilce")
    .select("id, city_id, name, code")
    .eq("city_id", cityId)
    .order("name", { ascending:true });

  if(error){
    toast("İlçe listesi alınamadı");
    districtCache.set(cityId, []);
    return [];
  }

  districtCache.set(cityId, data || []);
  return data || [];
}

function findCityIdForOrder(order, cities){
  if(order?.sehir_kodu){
    const hit = cities.find(c => String(c.id) === String(order.sehir_kodu));
    if(hit) return String(hit.id);
  }

  if(order?.sehir){
    const hit = cities.find(c => c.name?.toLowerCase() === order.sehir.toLowerCase());
    if(hit) return String(hit.id);
  }

  return "";
}

function findDistrictIdForOrder(order, districts){
  if(order?.ilce_kodu){
    const hit = districts.find(d => String(d.code) === String(order.ilce_kodu));
    if(hit) return String(hit.id);
  }

  if(order?.ilce){
    const hit = districts.find(d => d.name?.toLowerCase() === order.ilce.toLowerCase());
    if(hit) return String(hit.id);
  }

  return "";
}

function renderOptions(selectEl, list, { placeholder="Seçiniz", selectedValue="", includeCode=false } = {}){
  if(!selectEl) return;
  const opts = [`<option value="">${placeholder}</option>`];
  (list || []).forEach(item => {
    const attrs = [
      `value="${item.id}"`,
      includeCode ? `data-code="${item.code ?? ''}"` : ""
    ].filter(Boolean).join(" ");

    opts.push(`<option ${attrs}>${item.name}</option>`);
  });

  selectEl.innerHTML = opts.join("");
  if(selectedValue) selectEl.value = String(selectedValue);
}

async function populateDistrictSelect(cityId, selectedDistrictId){
  const districtSelect = document.getElementById("ilce_select");
  const ilceInput      = document.getElementById("ilce");
  const ilceKoduInput  = document.getElementById("ilce_kodu");

  const districts = await loadDistricts(cityId);

  renderOptions(districtSelect, districts, {
    placeholder: cityId ? "İlçe seçiniz" : "Önce şehir seçin",
    selectedValue: selectedDistrictId,
    includeCode: true,
  });

  const active = districtSelect?.selectedOptions?.[0];
  if(active){
    ilceInput.value = active.textContent;
    ilceKoduInput.value = active.dataset.code || "";
  }else{
    ilceInput.value = "";
    ilceKoduInput.value = "";
  }
}

/* ============================================================
   DÜZENLEME
============================================================ */
async function enterEditMode(){
  const d = selectedOrder;
  const cities = await loadCities();
  const selectedCityId = findCityIdForOrder(d, cities);
  const districts = selectedCityId ? await loadDistricts(selectedCityId) : [];
  const selectedDistrictId = findDistrictIdForOrder(d, districts);

  document.getElementById("orderDetails").innerHTML = `
    <div class="edit-card">
      <div class="edit-card__header">
        <div>
          <p class="eyebrow">Sipariş No</p>
          <p class="title">${d.siparis_no}</p>
        </div>
        <div class="pill">Durum: ${d.kargo_durumu}</div>
      </div>

      <div class="edit-grid">
        <div class="form-field"><label>Ad Soyad</label><input id="ad_soyad" value="${d.ad_soyad??""}"></div>
        <div class="form-field"><label>Sipariş Tel</label><input id="siparis_tel" value="${d.siparis_tel??""}"></div>
        <div class="form-field"><label>Müşteri Tel</label><input id="musteri_tel" value="${d.musteri_tel??""}"></div>

        <div class="form-field full-row"><label>Adres</label><textarea id="adres">${d.adres??""}</textarea></div>

        <div class="form-field">
          <label>Şehir</label>
          <select id="sehir_select"></select>
          <input id="sehir" type="hidden" value="${d.sehir ?? ""}">
        </div>

        <div class="form-field">
          <label>İlçe</label>
          <select id="ilce_select"></select>
          <input id="ilce" type="hidden" value="${d.ilce ?? ""}">
        </div>

        <div class="form-field">
          <label>Şehir Kodu</label>
          <input id="sehir_kodu" class="input-ghost" value="${d.sehir_kodu ?? ""}" readonly>
        </div>

        <div class="form-field">
          <label>İlçe Kodu</label>
          <input id="ilce_kodu" class="input-ghost" value="${d.ilce_kodu ?? ""}" readonly>
        </div>

        <div class="form-field"><label>Kargo Adet</label><input id="kargo_adet" value="${d.kargo_adet??""}"></div>
        <div class="form-field"><label>Kargo KG</label><input id="kargo_kg" value="${d.kargo_kg??""}"></div>

        <div class="form-field full-row"><label>Ürün</label><textarea id="urun_bilgisi">${d.urun_bilgisi??""}</textarea></div>
        <div class="form-field"><label>Tutar</label><input id="toplam_tutar" value="${d.toplam_tutar??""}"></div>
        <div class="form-field"><label>Ödeme</label><input id="odeme_sekli" value="${d.odeme_sekli??""}"></div>
        <div class="form-field full-row"><label>Not</label><textarea id="notlar">${d.notlar??""}</textarea></div>
      </div>
    </div>`;

  renderOptions(document.getElementById("sehir_select"), cities, {
    placeholder: "Şehir seçiniz",
    selectedValue: selectedCityId,
  });

  await populateDistrictSelect(selectedCityId, selectedDistrictId);

  const citySelect = document.getElementById("sehir_select");
  const districtSelect = document.getElementById("ilce_select");
  const sehirInput = document.getElementById("sehir");
  const ilceInput = document.getElementById("ilce");
  const sehirKoduInput = document.getElementById("sehir_kodu");
  const ilceKoduInput = document.getElementById("ilce_kodu");

  // ilk açılış değerleri
  sehirInput.value = citySelect?.selectedOptions?.[0]?.textContent || (d.sehir ?? "");
  sehirKoduInput.value = citySelect?.value || (d.sehir_kodu ?? "");

  const activeDistrict = districtSelect?.selectedOptions?.[0];
  if(activeDistrict){
    ilceInput.value = activeDistrict.textContent;
    ilceKoduInput.value = activeDistrict.dataset.code || "";
  }

  citySelect?.addEventListener("change", async()=>{
    const name = citySelect.selectedOptions?.[0]?.textContent || "";
    sehirInput.value = name;
    sehirKoduInput.value = citySelect.value || "";
    await populateDistrictSelect(citySelect.value, "");
  });

  districtSelect?.addEventListener("change", ()=>{
    const opt = districtSelect.selectedOptions?.[0];
    ilceInput.value = opt?.textContent || "";
    ilceKoduInput.value = opt?.dataset.code || "";
  });

  document.getElementById("actionButtons").style.display = "none";
  document.getElementById("editButtons").style.display = "flex";
}

async function saveEdit(){
  const citySelect = document.getElementById("sehir_select");
  const districtSelect = document.getElementById("ilce_select");

  const sehirName = citySelect?.selectedOptions?.[0]?.textContent || (document.getElementById("sehir")?.value ?? "");
  const ilceName  = districtSelect?.selectedOptions?.[0]?.textContent || (document.getElementById("ilce")?.value ?? "");

  const sehirKoduVal = citySelect?.value || document.getElementById("sehir_kodu")?.value || null;
  const ilceKoduVal  = districtSelect?.selectedOptions?.[0]?.dataset.code || document.getElementById("ilce_kodu")?.value || null;

  const updated = {
    ad_soyad: ad_soyad.value, siparis_tel: siparis_tel.value, musteri_tel: musteri_tel.value,
    adres: adres.value, sehir: sehirName, ilce: ilceName,
    sehir_kodu: sehirKoduVal, ilce_kodu: ilceKoduVal,
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

  setTimeout(() => loadOrders(true), 1000);
}

async function markPrepared(){
  await db.from(TABLE)
    .update({ kargo_durumu:"Hazırlandı" })
    .eq("siparis_no", selectedOrder.siparis_no);

  printSiparis(selectedOrder);

  toast("Sipariş Hazırlandı");
  closeModal();

  setTimeout(() => loadOrders(true), 1000);
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
const res = await fetch(WH_KARGOLA, {
  method:"POST",
  headers:{ "Content-Type":"application/json" },
  body: JSON.stringify(selectedOrder)
});

const data = await res.json();

// Artık data içindeki bilgileri gösterebilirsin
console.log("N8N cevabı:", data);


  let payload = {};
  try { payload = await res.json(); } catch {}

  // Kısa bildirim
  toast(payload?.message || "Kargoya gönderildi.");

  // PNG geldiyse göster
  if (payload?.png) {
    showApiResult(`<img src="${payload.png}" style="max-width:360px;border:1px solid #ccc;border-radius:8px">`);
  }
  // ZPL/JSON geldiyse metin olarak göster
  else if (payload?.apiResult || payload?.zpl || payload?.result) {
    showApiResult(payload.apiResult || payload.zpl || payload.result);
  }

  setTimeout(()=>loadOrders(true), 1000);
}catch(e){
  toast("Gönderim hatası");
}finally{
  setTimeout(()=>busy.kargola.delete(key), 20000);
}

}

async function printBarcode() {

  const ok = await confirmModal({
    title: "Barkod Kes",
    text: "Supabase içerisindeki barkod PDF/PNG dosyaları açılacak.",
    confirmText: "Aç",
    cancelText: "Vazgeç"
  });
  if (!ok) return;

  // Supabase'den veriyi çek
  const { data, error } = await db
    .from(TABLE)
    .select("zpl_base64")
    .eq("siparis_no", selectedOrder.siparis_no)
    .single();

  if (error) return toast("Barkod alınamadı!");
  if (!data?.zpl_base64) return toast("Barkod bulunamadı!");

  let raw = data.zpl_base64;
  let list = [];

  // JSON formatını çöz
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      list = parsed
        .map(item => {
          if (!item) return null;
          if (typeof item === "string") return item;
          if (typeof item === "object" && item.data) return item.data;
          return null;
        })
        .filter(x => !!x);
    } else list = [raw];

  } catch {
    list = [raw];
  }

  if (!list.length) return toast("Geçerli barkod bulunamadı!");

  // Base64 → Blob çevirici
  function base64ToBlob(base64, mime) {
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) buffer[i] = binary.charCodeAt(i);
    return new Blob([buffer], { type: mime });
  }

  // Her barkodu ayrı sekmede aç
  list.forEach(b64 => {
    if (typeof b64 !== "string") return;

    const trimmed = b64.trim();

    // PDF / PNG algılaması
    let mime = "application/pdf";
    if (trimmed.startsWith("iVBOR")) mime = "image/png";

    // Blob'a çevir
    const blob = base64ToBlob(trimmed, mime);
    const blobUrl = URL.createObjectURL(blob);

    // Yeni sekme aç
    const w = window.open("", "_blank");
    if (!w) {
      toast("Pop-up engellendi, izin ver.");
      return;
    }

    // Chrome PDF bug fix → iframe içinde aç
    w.document.write(`
      <html>
      <head>
        <title>Barkod</title>
        <style>
          body { margin:0; padding:0; overflow:hidden; background:#000; }
          iframe { border:0; width:100vw; height:100vh; }
        </style>
      </head>
      <body>
        <iframe src="${blobUrl}"></iframe>
      </body>
      </html>
    `);
    w.document.close();
  });

  toast(list.length + " adet barkod açıldı.");
}



/* ============================================================
   İPTAL / GERİ AL
============================================================ */

function cancelCancelForm(){
  document.getElementById("cancelForm").style.display = "none";
  document.getElementById("actionButtons").style.display = "flex";
}

async function openCancelForm() {

  const codeRaw = selectedOrder?.shipmentStatusCode;
  let isShipped = false;

  if (codeRaw === null || codeRaw === undefined || codeRaw === "" || codeRaw === "0") {
    isShipped = false;
  } else {
    const num = Number(codeRaw);
    isShipped = Number.isInteger(num) && num >= 1 && num <= 9;
  }

  // 🚨 Kargolanmışsa → daha form açılmadan uyarı ver!
  if (isShipped) {
    const ok = await confirmModal({
      title: "Kargolanmış Siparişi İptal Et",
      text: `Bu sipariş kargoya gönderilmiş durumda.
İptal sonucu ek ücret çıkabilir.

Devam etmek istiyor musunuz?`,
      confirmText: "Devam Et",
      cancelText: "Vazgeç"
    });

    if (!ok) return; // vazgeçerse form açma
  }

  // 🟢 Kargolanmamışsa veya onay verildiyse → formu aç
  document.getElementById("cancelForm").style.display = "block";
  document.getElementById("actionButtons").style.display = "none";
}



/* ============================================================
   KARGOLANMIŞ İPTAL
============================================================ */

async function confirmCancel() {

  const reason = document.getElementById("iptalInput").value.trim();
  if (!reason) return toast("İptal nedeni gerekli");

  const codeRaw = selectedOrder?.shipmentStatusCode;
  let isShipped = false;

  if (!codeRaw || codeRaw === "0") {
    isShipped = false;
  } else {
    const num = Number(codeRaw);
    isShipped = Number.isInteger(num) && num >= 1 && num <= 9;
  }

  // 🚫 BU FONKSİYONDA ALERT / POPUP KESİNLİKLE OLMAYACAK.

  // — Webhook —
  if (WH_IPTAL) {
    try {
      await fetch(WH_IPTAL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selectedOrder, reason, isShipped })
      });
    } catch {
      toast("İptal webhook gönderilemedi.");
    }
  }

  // — DB Güncelle —
  await db.from(TABLE).update({
    kargo_durumu: "İptal",
    iptal_nedeni: reason,
    iptal_tarihi: new Date().toISOString()
  }).eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş iptal edildi");
  closeModal();
  loadOrders(true);
}




async function restoreOrder(){
  const ok = await confirmModal({
    title: "Bekleyenlere Geri Al",
    text: "Bu sipariş bekleyen siparişlere geri alınacaktır. Onaylıyor musunuz?",
    confirmText: "Evet",
    cancelText: "Hayır"
  });

  if(!ok) return;

  await db.from(TABLE).update({
    kargo_durumu:"Bekliyor",
    iptal_nedeni:null,
    iptal_tarihi:null
  }).eq("siparis_no", selectedOrder.siparis_no);

  toast("Sipariş geri alındı");
  closeModal();

  setTimeout(() => loadOrders(true), 1000);
}

/* ============================================================
   ARAMA
============================================================ */
async function searchOrders() {
  const qRaw = document.getElementById("searchInput").value.trim();
  if (!qRaw) return loadOrders(true);

  // TÜRKÇE KARAKTER TEMİZLİĞİ + LOWERCASE
  const q = qRaw
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // aksan temizleme: ö→o, ç→c

  // Supabase V2 için OR query TEK SATIR olmalı!
  const orQuery = [
    `siparis_no.eq.${qRaw}`,         // sipariş no sayı olduğu için raw kullanılacak
    `ad_soyad.ilike.%${q}%`,
    `siparis_tel.ilike.%${q}%`,
    `musteri_tel.ilike.%${q}%`,
    `adres.ilike.%${q}%`,
    `kargo_takip_kodu.ilike.%${q}%`
  ].join(",");

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .or(orQuery);

  if (error) {
    console.error("Arama Hatası:", error);
    toast("Arama yapılırken bir hata oluştu!");
    return;
  }

  renderTable(data, { append: false, hasMore: false });
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
   ENNTER İLE ARA 
============================================================ */

// ENTER ile arama
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("searchInput");
  if (!input) return;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();   // Sayfanın yenilenmesini engeller
      searchOrders();       // 🔥 Aramayı tetikler
    }
  });
});

/* ============================================================
   GLOBAL EXPORT
============================================================ */
Object.assign(window, {
  logout,
  loadOrders,
   loadMore,
  setTab,
  searchOrders,
  clearSearch,
  toggleMenu,

  openOrder,
  closeModal,

  openTrackingUrl,
  showErrorDetail,

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
deleteCanceledOrder,

  printSiparis,
});

/* ============================================================
   BAŞLAT
============================================================ */
