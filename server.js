const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

let qrCodeData = '';
let isConnected = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = await QRCode.toDataURL(qr);
            isConnected = false;
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Terhubung & Siap!');
            isConnected = true;
            qrCodeData = '';
        }
    });

    app.post('/send-piket', async (req, res) => {
        const { nomor, nama, hari, tugas } = req.body;

        if (!nomor || !nama || !hari) {
            return res.status(400).json({ status: false, message: 'Data nomor, nama, dan hari wajib diisi!' });
        }

        let formattedNumber = nomor.replace(/\D/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.slice(1);
        }
        const id = `${formattedNumber}@s.whatsapp.net`;

        const message = `Halo *${nama}*,\n\nIni pengingat *Jadwal Piket* untuk hari *${hari}*.\n*Tugas:* ${tugas || 'Menjaga kebersihan'}.\n\nMohon dilaksanakan ya. Terima kasih!`;

        try {
            await sock.sendMessage(id, { text: message });
            res.status(200).json({ status: true, message: `Pesan terkirim ke ${nama}` });
        } catch (error) {
            res.status(500).json({ status: false, message: 'Gagal mengirim pesan', error: error.toString() });
        }
    });
}

app.get('/', (req, res) => {
    if (isConnected) {
        return res.send('<h1>WhatsApp Bot Terhubung & Siap!</h1>');
    }
    if (qrCodeData) {
        return res.send(`<h1>Scan QR Code untuk Login WhatsApp</h1><br><img src="${qrCodeData}" /><p>Silakan scan menggunakan WhatsApp di HP kamu.</p>`);
    }
    res.send('<h1>Sedang menyiapkan QR Code, silakan muat ulang halaman beberapa detik lagi...</h1>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
});

connectToWhatsApp();
