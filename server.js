const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');

const app = express();
app.use(express.json());

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Terhubung & Siap!');
        }
    });
}

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
});

connectToWhatsApp();
