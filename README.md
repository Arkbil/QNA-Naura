# Naura Q&A Desk

Website statis untuk sesi Q&A paper *LIME-Guided Refinement for One-Day-Ahead Rainfall Classification Using XGBoost at Bandung Geophysical Station*. Bank berisi **201 topik jawaban dan 1.031 bentuk pertanyaan**, termasuk **100 topik teknis AI**. Semua jawaban memiliki versi lisan yang lebih panjang dalam bahasa Inggris. Pertanyaan tampil berbentuk pertanyaan seminar yang lengkap dan sopan; versi pendek tetap dipakai untuk pencocokan transkrip. Domain teknis AI tampil paling depan.

## Jalankan sebelum acara

1. Buka website lewat HTTPS (misalnya Render) di browser desktop yang mendukung mikrofon dan WebAssembly.
2. Tekan **Prepare offline speech** saat internet masih tersedia. Bila speech lokal browser tidak tersedia, aplikasi memuat model Vosk Inggris yang sudah dibundel (~41 MB) dan mengekstraknya ke penyimpanan browser (~71 MB). Pemrosesan pertama dapat memakan beberapa menit; status menampilkan waktu yang telah berlalu. Tunggu status **Offline Vosk speech is ready**. Jika lebih dari tiga menit, aplikasi menampilkan galat dan pencarian ketik tetap tersedia.
3. Izinkan mikrofon, lalu uji satu pertanyaan. **Enter question mode** mulai mendengarkan. **Return to idle** mematikan mikrofon.
4. Setelah satu jawaban muncul, tekan **Follow-up mode** untuk pertanyaan lanjutan. **New question** memulai ucapan baru dan mempertahankan konteks jawaban terakhir. **Reset context** memulai dari nol.
   Saat mengetik atau berbicara, panel kanan menampilkan sampai lima kandidat berurutan dengan persentase skor kecocokan. Klik kandidat untuk memeriksa jawabannya secara manual. Pertanyaan pendek atau ambigu tidak membuka jawaban otomatis.
5. Setelah halaman dan model siap, matikan Wi-Fi dan coba lagi. Jangan menghapus data situs atau cache browser sebelum acara. Tunggu instalasi cache situs selesai sebelum mematikan Wi-Fi.
6. Jika suara lokal tidak tersedia, ketik pertanyaan di kotak teks. Aplikasi tidak akan beralih diam-diam ke layanan suara cloud.

Audio diproses oleh `SpeechRecognition.processLocally` bila tersedia, atau oleh Vosk WebAssembly di browser. Kedua jalur memproses suara di perangkat. Pencocokan berjalan dengan JavaScript lokal terhadap bank Q&A. Service worker menyimpan halaman, bank, dan kode Vosk. Vosk sendiri menyimpan model yang sudah diekstrak di penyimpanan browser setelah berhasil memuatnya; aplikasi tidak lagi menyimpan salinan arsip 41 MB. Pembukaan pertama situs di Render tetap membutuhkan internet. Berkas model adalah `model-en.tar.gz` (41,166,150 byte).

## Menjalankan lokal

Di folder ini jalankan `python -m http.server 8765`, lalu buka `http://localhost:8765`. Mikrofon tidak bekerja dari berkas `file://`; gunakan localhost atau HTTPS.

Jika drive C: hampir penuh, jalankan `powershell -ExecutionPolicy Bypass -File .\open-qna-browser.ps1 -Url "https://alamat-situs.onrender.com"`. Skrip membuka Edge (atau Chrome) dengan profil dan folder sementara di drive D:, sehingga model Vosk punya ruang untuk diekstrak. Izinkan mikrofon lagi pada profil baru. Ganti URL dengan alamat Render yang sebenarnya; tanpa `-Url`, skrip membuka localhost.

## Deploy Render

Untuk repo `Arkbil/QNA-Naura`, pilihan utama di Render adalah **New → Static Site**: branch `main`, Root Directory kosong, Build Command `echo ready`, dan Publish Directory `.`. Jika sudah terlanjur membuat **Web Service**, repo ini juga memiliki `package.json` dan server Node kecil: gunakan Build Command `echo ready` dan Start Command `yarn start`. Server tersebut hanya mengirim berkas statis; pemrosesan suara dan pencocokan tetap berjalan di browser tanpa API key.

## Bank jawaban

`qna.json`, `qna-extra.json`, `qna-ai.json`, dan `qna-ai-deep.json` menyimpan pertanyaan pendek, variasi ucapan, kata kunci, jawaban, dan sumber. `spoken-questions.json` menyimpan 201 pertanyaan seminar yang ditampilkan. `guidance-en.json` menambahkan kategori, cara berpikir, kata kunci bicara, dan cabang follow-up untuk topik dasar. Jawaban teknis membedakan konsep AI umum dari hasil yang benar-benar dilaporkan paper; detail yang tidak ada ditandai **not reported** atau **not tested**. Persentase yang muncul adalah **skor kecocokan teks**, bukan probabilitas bahwa jawaban benar. Hasil di bawah ambang atau yang terlalu ambigu ditolak; cek pertanyaan sumber sebelum bicara.

Rujukan teknis utama: [XGBoost parameters](https://xgboost.readthedocs.io/en/stable/parameter.html), [XGBoost Python API](https://xgboost.readthedocs.io/en/stable/python/python_api.html), [LIME original paper](https://arxiv.org/abs/1602.04938), [TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html), dan [on-device SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static).

Komponen suara: [`vosk-browser` 0.0.8](https://www.npmjs.com/package/vosk-browser) (Apache-2.0) dan [model Vosk English small 0.15](https://huggingface.co/pwndl11/vosk-model-small-en-us-0.15) (Apache-2.0). Teks lisensi ada di `APACHE-2.0-LICENSE.txt`. SHA-256 model: `92E22F0DBF60108EC5E9516CFA7F429F910A9E7C4A0719758C9FE9C5A2615D48`.

## Batasan

Pengenalan suara lokal memerlukan mikrofon, WebAssembly, dan ruang cache browser untuk model. Aplikasi dikunci ke **English (US)**. Kebisingan ruangan dan istilah teknis dapat mengurangi akurasi transkripsi. Ketik pertanyaan bila perlu. Jalankan `node test_match.cjs`, `node test_ui.cjs`, dan `node test_speech.cjs` untuk memeriksa bank, UI, dan fallback mikrofon.
