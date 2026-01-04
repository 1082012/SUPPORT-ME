// CONFIGURATION
const TITAN_CONFIG = {
    owner: "1082012",
    repo: "TzyTech",
    token: "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",
    dbPath: "database/donations.json",
    pakasir: {
        slug: "support-gusti",
        apiKey: "pOBedUCz1g4EA7kHHkHijV4CdhSvrGLE"
    }
};

// INITIALIZE ICONS
lucide.createIcons();

// INPUT FORMATTING (IDR)
const donorAmount = document.getElementById('donorAmount');
donorAmount.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val > 200000) val = 200000;
    e.target.value = new Intl.NumberFormat('id-ID').format(val);
});

// CORE: PROCESS DONATION
async function processDonation() {
    const name = document.getElementById('donorName').value;
    const rawAmount = donorAmount.value.replace(/\D/g, "");
    const btn = document.getElementById('btnSubmit');

    if (!name || rawAmount < 1000) return showToast("Lengkapi data dengan benar!");

    // Button Loading State
    btn.innerHTML = `<span class="animate-spin inline-block w-5 h-5 border-2 border-black border-t-transparent rounded-full"></span>`;
    btn.disabled = true;

    const orderId = `DON-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.floor(Math.random() * 1000)}`;

    try {
        // 1. Fetch current database SHA and content
        const res = await fetch(`https://api.github.com/repos/${TITAN_CONFIG.owner}/${TITAN_CONFIG.repo}/contents/${TITAN_CONFIG.dbPath}`, {
            headers: { 'Authorization': `token ${TITAN_CONFIG.token}` }
        });
        
        let currentData = [];
        let sha = "";
        
        if (res.ok) {
            const json = await res.json();
            sha = json.sha;
            currentData = JSON.parse(decodeURIComponent(escape(atob(json.content))));
        }

        // 2. Prepare new entry
        const newDonation = {
            order_id: orderId,
            nama: name,
            amount: parseInt(rawAmount),
            status: "pending",
            tanggal: new Date().toISOString()
        };
        currentData.push(newDonation);

        // 3. Update GitHub Database
        const pushRes = await fetch(`https://api.github.com/repos/${TITAN_CONFIG.owner}/${TITAN_CONFIG.repo}/contents/${TITAN_CONFIG.dbPath}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `token ${TITAN_CONFIG.token}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                message: `Order Created: ${orderId}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(currentData, null, 2)))),
                sha: sha || undefined
            })
        });

        if (!pushRes.ok) throw new Error("GitHub Sync Error");

        // 4. Redirect to Pakasir Payment
        const paymentUrl = `https://app.pakasir.com/pay/${TITAN_CONFIG.pakasir.slug}/${rawAmount}?order_id=${orderId}&qris_only=1&redirect=${encodeURIComponent(window.location.href + "?order_id=" + orderId)}`;
        location.href = paymentUrl;

    } catch (err) {
        showToast("Gagal: " + err.message);
        btn.innerHTML = `Lanjutkan Donasi <i data-lucide="arrow-right" class="w-5 h-5"></i>`;
        btn.disabled = false;
        lucide.createIcons();
    }
}

// CHECK REDIRECT STATUS (AFTER PAYMENT)
async function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id');

    if (orderId) {
        document.getElementById('formSection').classList.add('hidden');
        document.getElementById('successSection').classList.remove('hidden');
        document.getElementById('successMsg').innerText = "Memverifikasi pembayaran...";

        try {
            const resPakasir = await fetch(`https://app.pakasir.com/api/transactiondetail?api_key=${TITAN_CONFIG.pakasir.apiKey}&order_id=${orderId}`);
            const statusData = await resPakasir.json();

            if (statusData.data && statusData.data.status === "Selesai") {
                await updateStatusCompleted(orderId);
                document.getElementById('successMsg').innerHTML = `Makasii buat <span class="text-white font-bold">${statusData.data.customer_name || 'kamu'}</span><br>Donasi <span class="text-sky-400 font-black">Rp ${parseInt(statusData.data.amount).toLocaleString('id-ID')}</span>-nyaaa!! 💖`;
            } else {
                document.getElementById('successMsg').innerText = "Menunggu pembayaran / Gagal terdeteksi.";
            }
        } catch (e) {
            document.getElementById('successMsg').innerText = "Koneksi ke Pakasir terputus.";
        }
        lucide.createIcons();
    }
}

// UPDATE DATABASE STATUS TO COMPLETED
async function updateStatusCompleted(id) {
    const res = await fetch(`https://api.github.com/repos/${TITAN_CONFIG.owner}/${TITAN_CONFIG.repo}/contents/${TITAN_CONFIG.dbPath}`, {
        headers: { 'Authorization': `token ${TITAN_CONFIG.token}` }
    });
    const json = await res.json();
    let data = JSON.parse(decodeURIComponent(escape(atob(json.content))));
    
    const idx = data.findIndex(x => x.order_id === id);
    if (idx !== -1 && data[idx].status !== "completed") {
        data[idx].status = "completed";
        data[idx].selesai_pada = new Date().toISOString();
        
        await fetch(`https://api.github.com/repos/${TITAN_CONFIG.owner}/${TITAN_CONFIG.repo}/contents/${TITAN_CONFIG.dbPath}`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${TITAN_CONFIG.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Order Completed: ${id}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
                sha: json.sha
            })
        });
    }
}

// NOTIFICATION LOGIC
function showToast(m) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = m;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 3000);
}

// RUN ON LOAD
checkPaymentStatus();
