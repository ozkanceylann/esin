window.CONFIG = {};
window.CONFIG_READY = false;

async function loadBrandConfig() {
    try {
        const res = await fetch("brand.config.json?cache=" + Date.now());
        window.CONFIG = await res.json();
        window.CONFIG_READY = true;
        console.log("✔ Marka config yüklendi:", CONFIG);
    } catch (err) {
        console.error("Config yüklenemedi!", err);
    }
}

loadBrandConfig();
