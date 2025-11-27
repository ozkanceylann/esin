/*
 *  MARKA CONFIG YÜKLEYİCİ
 *  Tüm panel dosyaları bu config'i kullanır.
 *  brand.config.json dosyasındaki bilgiler paneli markaya dönüştürür.
 */

window.CONFIG = {};
window.CONFIG_READY = false;

async function loadBrandConfig() {
    try {
        // Cache kırmak için tarih parametresi
        const res = await fetch("brand.config.json?ts=" + Date.now());

        if (!res.ok) {
            console.error("❌ brand.config.json yüklenemedi!");
            return;
        }

        window.CONFIG = await res.json();
        window.CONFIG_READY = true;

        console.log("✔ Marka config yüklendi:", window.CONFIG);

    } catch (err) {
        console.error("❌ Config dosyası okunurken hata:", err);
    }
}

// Config'i hemen yükle
loadBrandConfig();

/*
 *  CONFIG hazır olmadan çalışan dosyalar için
 *  beklemek amacıyla global bir fonksiyon veriyoruz.
 */
window.waitConfig = async function () {
    while (!window.CONFIG_READY) {
        await new Promise(r => setTimeout(r, 50));
    }
};
