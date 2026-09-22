const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;
let groupList = [];

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log('Koneksi terputus, mencoba hubungkan ulang...', statusCode);
            isConnected = false;
            setTimeout(connectToWhatsApp, 3000);
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Terhubung & Siap!');
            isConnected = true;

            try {
                const groups = await sock.groupFetchAllParticipating();
                groupList = Object.values(groups).map(g => ({
                    id: g.id,
                    subject: g.subject
                }));
            } catch (err) {
                console.error('Gagal mengambil daftar grup:', err);
            }
        }
    });

    function formatTarget(target) {
        let destinationId = target.trim();
        if (!destinationId.includes('@g.us')) {
            let formattedNumber = destinationId.replace(/\D/g, '');
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.slice(1);
            }
            destinationId = `${formattedNumber}@s.whatsapp.net`;
        }
        return destinationId;
    }

    app.post('/send-jadwal-piket', async (req, res) => {
        const { target, kelas, sekolah, hari_tanggal, daftar_siswa } = req.body;
        if (!target || !kelas || !daftar_siswa) {
            return res.status(400).json({ status: false, message: 'Data target, kelas, dan daftar_siswa wajib diisi!' });
        }
        const destinationId = formatTarget(target);
        const listSiswa = Array.isArray(daftar_siswa) 
            ? daftar_siswa.map((nama, idx) => `${idx + 1}. ${nama}`).join('\n')
            : daftar_siswa;

        const message = `🔔 *PENGINGAT JADWAL PIKET HARI INI* 🔔\n` +
                        `Kelas *${kelas}* - *${sekolah || 'SMA Negeri Rancakalong'}*\n` +
                        `Hari/Tanggal: *${hari_tanggal}*\n\n` +
                        `Berikut adalah nama-nama siswa yang bertugas piket hari ini:\n\n` +
                        `${listSiswa}\n\n` +
                        `Mohon bantuannya untuk mengingatkan para siswa. Semangat! 💪✨`;

        try {
            await sock.sendMessage(destinationId, { text: message });
            res.status(200).json({ status: true, message: `Jadwal piket berhasil dikirim ke ${kelas}` });
        } catch (error) {
            res.status(500).json({ status: false, message: 'Gagal mengirim pesan', error: error.toString() });
        }
    });

    app.post('/send-tidak-piket', async (req, res) => {
        const { target, kelas, sekolah, hari_tanggal, daftar_siswa_tidak_piket } = req.body;
        if (!target || !kelas || !daftar_siswa_tidak_piket) {
            return res.status(400).json({ status: false, message: 'Data target, kelas, dan daftar_siswa_tidak_piket wajib diisi!' });
        }
        const destinationId = formatTarget(target);
        const listSiswa = Array.isArray(daftar_siswa_tidak_piket)
            ? daftar_siswa_tidak_piket.map((item, idx) => {
                if (typeof item === 'object') {
                    return `${idx + 1}. ${item.nama} *(Keterangan: ${item.keterangan || 'Hadir'})*`;
                }
                return `${idx + 1}. ${item} *(Keterangan: Hadir)*`;
            }).join('\n')
            : daftar_siswa_tidak_piket;

        const message = `Halo Ibu/Bapak Wali Kelas / Anggota Kelas *${kelas}*,\n` +
                        `*${sekolah || 'SMA Negeri Rancakalong'}*\n\n` +
                        `Perkenalkan saya Admin, izin menginformasikan bahwa pada hari *${hari_tanggal}* berikut siswa kelas yang tidak menjalankan piket:\n\n` +
                        `${listSiswa}\n\n` +
                        `Mohon bantuan dan arahannya, akan diberlakukan denda sesuai ketentuan kelas masing-masing.\n\n` +
                        `Terima kasih atas perhatian dan kerja samanya. 🙏`;

        try {
            await sock.sendMessage(destinationId, { text: message });
            res.status(200).json({ status: true, message: `Laporan tidak piket berhasil dikirim ke ${kelas}` });
        } catch (error) {
            res.status(500).json({ status: false, message: 'Gagal mengirim pesan', error: error.toString() });
        }
    });
}

// Halaman Minta Kode Pairing
app.get('/pair', async (req, res) => {
    const phone = req.query.phone;
    if (!phone) {
        return res.send(`
            <h2>Tautkan WhatsApp Tanpa Scan QR</h2>
            <form action="/pair" method="get">
                <label>Masukkan Nomor WA yang Mau Dijadikan Bot:</label><br><br>
                <input type="text" name="phone" placeholder="Contoh: 081234567890" required style="padding:10px; width:280px;"><br><br>
                <button type="submit" style="padding:10px 20px; background-color:green; color:white; border:none; border-radius:5px; font-weight:bold;">Minta Kode Pairing</button>
            </form>
        `);
    }

    if (isConnected) {
        return res.send('<h3>WhatsApp Sudah Terhubung & Aktif!</h3><a href="/">Klik ke Beranda untuk Lihat ID Grup</a>');
    }

    try {
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }

        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(formattedPhone);
                res.send(`
                    <h2>Kode Tautan WhatsApp Kamu:</h2>
                    <h1 style="color:#007bff; font-size:45px; letter-spacing:6px; background:#f0f0f0; display:inline-block; padding:10px 20px; border-radius:8px;">${code}</h1>
                    <br><br>
                    <p><b>Cara Masukkin Kode ke WA Kamu:</b></p>
                    <ol style="line-height:28px;">
                        <li>Buka aplikasi WhatsApp di HP kamu.</li>
                        <li>Klik <b>Titik Tiga</b> (di kanan atas) &rarr; Pilih <b>Perangkat Tertaut</b>.</li>
                        <li>Klik tombol <b>Tautkan Perangkat</b>.</li>
                        <li>Pilih tulisan kecil di bawah: <b>"Tautkan dengan nomor telepon saja"</b>.</li>
                        <li>Masukkan 8 kode angka di atas.</li>
                    </ol>
                    <br><a href="/" style="font-size:18px;">Klik di sini setelah berhasil memasukkan kode</a>
                `);
            } catch (err) {
                res.send(`<h3>Gagal dapet kode: ${err.message}</h3><a href="/pair">Coba lagi</a>`);
            }
        }, 1500);
    } catch (e) {
        res.send(`<h3>Error: ${e.message}</h3>`);
    }
});

app.get('/', (req, res) => {
    if (isConnected) {
        let groupsHtml = '<h3>Daftar Grup WA Terhubung:</h3><ul>';
        if (groupList.length > 0) {
            groupList.forEach(g => {
                groupsHtml += `<li><b>Nama Grup:</b> ${g.subject} <br> <b>ID Grup:</b> <code>${g.id}</code></li><br>`;
            });
        } else {
            groupsHtml += '<li>Belum ada grup yang terhubung atau pastikan nomor bot sudah dimasukkan ke dalam grup kelas.</li>';
        }
        groupsHtml += '</ul>';

        return res.send(`<h1>WhatsApp Bot Terhubung & Siap!</h1>${groupsHtml}`);
    }

    res.send(`
        <h1>WhatsApp Bot Belum Terhubung</h1>
        <p>Tautkan nomor WhatsApp kamu secara praktis menggunakan kode 8 angka.</p>
        <a href="/pair" style="font-size:20px; font-weight:bold; color:green;">👉 Klik di sini untuk Tautkan Nomor HP Bot</a>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
    connectToWhatsApp();
});
