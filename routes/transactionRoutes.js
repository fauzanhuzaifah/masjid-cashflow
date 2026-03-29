const express = require('express');
const router = express.Router();
const db = require('../database'); // gunakan wrapper database.js
const { requireLogin } = require('../middleware/auth');

// --- HALAMAN DASHBOARD (Dengan Pagination) ---
router.get('/dashboard', requireLogin, async (req, res) => {
    try {
        // 1. Ambil parameter pencarian & pagination
        const { searchName, searchCategory, startDate, endDate } = req.query;
        
        const limitOptions = [10, 25, 50, 100];
        let limit = parseInt(req.query.limit) || 10;
        if (!limitOptions.includes(limit)) limit = 10;

        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;
        
        // 2. Total Income & Expense (global)
        const [incomeRows] = await db.query(
            `SELECT SUM(amount) as total FROM transactions t 
             JOIN categories c ON t.category_id = c.id 
             WHERE c.type = 'income'`
        );
        const totalIncome = Number(incomeRows[0]?.total) || 0;

        const [expenseRows] = await db.query(
            `SELECT SUM(amount) as total FROM transactions t 
             JOIN categories c ON t.category_id = c.id 
             WHERE c.type = 'expense'`
        );
        const totalExpense = Number(expenseRows[0]?.total) || 0;
        const balance = totalIncome - totalExpense;

        // 3. Query hitung total data (untuk pagination) dengan filter
        let countSql = `
            SELECT COUNT(*) as total 
            FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE 1=1
        `;
        const countParams = [];

        if (searchName) {
            countSql += " AND (t.donor_name ILIKE $1 OR t.description ILIKE $2)";
            countParams.push(`%${searchName}%`, `%${searchName}%`);
        }
        if (searchCategory && searchCategory !== 'all') {
            countSql += ` AND c.name = $${countParams.length + 1}`;
            countParams.push(searchCategory);
        }
        if (startDate) {
            countSql += ` AND t.date >= $${countParams.length + 1}`;
            countParams.push(startDate);
        }
        if (endDate) {
            countSql += ` AND t.date <= $${countParams.length + 1}`;
            countParams.push(endDate);
        }

        const [countResult] = await db.query(countSql, countParams);
        const totalItems = Number(countResult[0].total);
        const totalPages = Math.ceil(totalItems / limit);

        // 4. Query ambil data transaksi dengan filter & pagination
        let querySql = `
            SELECT t.id, t.date, t.donor_name, c.name as category, c.type, t.amount, t.description 
            FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE 1=1
        `;
        const params = [];

        if (searchName) {
            querySql += ` AND (t.donor_name ILIKE $${params.length + 1} OR t.description ILIKE $${params.length + 2})`;
            params.push(`%${searchName}%`, `%${searchName}%`);
        }
        if (searchCategory && searchCategory !== 'all') {
            querySql += ` AND c.name = $${params.length + 1}`;
            params.push(searchCategory);
        }
        if (startDate) {
            querySql += ` AND t.date >= $${params.length + 1}`;
            params.push(startDate);
        }
        if (endDate) {
            querySql += ` AND t.date <= $${params.length + 1}`;
            params.push(endDate);
        }

        querySql += ` ORDER BY t.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [allTransactions] = await db.query(querySql, params);

        // 5. Pisahkan data
        const incomeTransactions = allTransactions.filter(trx => trx.type === 'income');
        const expenseTransactions = allTransactions.filter(trx => trx.type === 'expense');

        let activeTab = 'income';
        if (incomeTransactions.length === 0 && expenseTransactions.length > 0) {
            activeTab = 'expense';
        }

        // 6. Ambil kategori
        const [categories] = await db.query("SELECT name FROM categories ORDER BY id ASC");

        res.render('dashboard', { 
            user: req.session,
            totalIncome, 
            totalExpense, 
            balance, 
            incomeTransactions,
            expenseTransactions,
            categories,
            query: req.query,
            activeTab,
            pagination: {
                page: page,
                totalPages: totalPages,
                totalItems: totalItems,
                limit: limit
            },
            limitOptions: limitOptions
        });

    } catch (err) {
        console.error(err);
        res.send("Error loading dashboard");
    }
});

// --- FORM INPUT PEMASUKAN ---
router.get('/transaction/add-income', requireLogin, async (req, res) => {
    const [categories] = await db.query("SELECT * FROM categories WHERE type = 'income' ORDER BY name");
    res.render('addIncome', { categories, user: req.session });
});

// --- FORM INPUT PENGELUARAN ---
router.get('/transaction/add-expense', requireLogin, async (req, res) => {
    const [categories] = await db.query("SELECT * FROM categories WHERE type = 'expense' ORDER BY id ASC");
    res.render('addExpense', { categories, user: req.session });
});

// --- PROSES SIMPAN DATA ---
router.post('/transaction/add', requireLogin, async (req, res) => {
    const { date, category_id, amount, description, donor_name } = req.body;
    const userId = req.session.userId;
    try {
        await db.query(
            `INSERT INTO transactions (date, category_id, amount, description, donor_name, user_id) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [date, category_id, amount, description, donor_name, userId]
        );
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.send("Gagal menyimpan transaksi");
    }
});

// --- FORM EDIT TRANSAKSI ---
router.get('/transaction/edit/:id', requireLogin, async (req, res) => {
    try {
        const [trxRows] = await db.query("SELECT * FROM transactions WHERE id = $1", [req.params.id]);
        if (trxRows.length === 0) return res.send("Data tidak ditemukan");
        const transaction = trxRows[0];
        const [categories] = await db.query("SELECT * FROM categories ORDER BY type, name");
        res.render('editTransaction', { transaction, categories, user: req.session });
    } catch (err) {
        console.error(err);
        res.send("Error");
    }
});

// --- PROSES UPDATE TRANSAKSI ---
router.post('/transaction/update/:id', requireLogin, async (req, res) => {
    const { date, category_id, amount, description, donor_name } = req.body;
    try {
        await db.query(
            `UPDATE transactions SET date = $1, category_id = $2, amount = $3, description = $4, donor_name = $5 
             WHERE id = $6`,
            [date, category_id, amount, description, donor_name, req.params.id]
        );
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.send("Gagal update");
    }
});

// --- HAPUS TRANSAKSI ---
router.post('/transaction/delete/:id', requireLogin, async (req, res) => {
    try {
        await db.query("DELETE FROM transactions WHERE id = $1", [req.params.id]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.send("Gagal hapus");
    }
});

// --- CETAK KWITANSI ---
router.get('/transaction/receipt/:id', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT t.*, c.name as category_name 
            FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE t.id = $1
        `, [req.params.id]);
        if (rows.length === 0) return res.send("Data tidak ditemukan");
        res.render('printReceipt', { user: req.session, transaction: rows[0], printMode: true });
    } catch (err) {
        console.error(err);
        res.send("Error");
    }
});

// --- HALAMAN MENU LAPORAN ---
router.get('/report', requireLogin, async (req, res) => {
    try {
        const [categories] = await db.query("SELECT * FROM categories ORDER BY type, name");
        const now = new Date();
        const years = [];
        for(let i = now.getFullYear() - 2; i <= now.getFullYear() + 1; i++) years.push(i);
        res.render('reportMenu', { 
            user: req.session, categories, years,
            currentMonth: now.getMonth() + 1, currentYear: now.getFullYear()
        });
    } catch (err) {
        console.error(err);
        res.send("Error");
    }
});

// --- PROSES CETAK LAPORAN SPESIFIK (PDF) ---
router.get('/report/print-specific', requireLogin, async (req, res) => {
    try {
        const { category_id, month, year } = req.query;
        const [catRows] = await db.query("SELECT * FROM categories WHERE id = $1", [category_id]);
        if (catRows.length === 0) return res.send("Kategori tidak ditemukan");
        const categoryInfo = catRows[0];

        const [transactions] = await db.query(`
            SELECT t.date, t.donor_name, t.amount, t.description, u.username as admin_name
            FROM transactions t 
            JOIN users u ON t.user_id = u.id
            WHERE t.category_id = $1 
              AND EXTRACT(MONTH FROM t.date) = $2 
              AND EXTRACT(YEAR FROM t.date) = $3
            ORDER BY t.date ASC
        `, [category_id, month, year]);

        const total = transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

        res.render('printSpecific', {
            user: req.session, categoryInfo, transactions, total,
            monthName: monthNames[month - 1], year, printMode: true
        });
    } catch (err) {
        console.error(err);
        res.send("Error generating report");
    }
});

// --- EXPORT LAPORAN KE EXCEL ---
router.get('/report/export-excel', requireLogin, async (req, res) => {
    try {
        const { category_id, month, year } = req.query;
        const [catRows] = await db.query("SELECT * FROM categories WHERE id = $1", [category_id]);
        if (catRows.length === 0) return res.send("Kategori tidak ditemukan");
        const categoryInfo = catRows[0];

        const [transactions] = await db.query(`
            SELECT t.date, t.donor_name, t.amount, t.description, u.username as admin_name
            FROM transactions t 
            JOIN users u ON t.user_id = u.id
            WHERE t.category_id = $1 
              AND EXTRACT(MONTH FROM t.date) = $2 
              AND EXTRACT(YEAR FROM t.date) = $3
            ORDER BY t.date ASC
        `, [category_id, month, year]);

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Kas');
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

        worksheet.mergeCells('A1:F1');
        worksheet.getCell('A1').value = `LAPORAN ${categoryInfo.type === 'income' ? 'PEMASUKAN' : 'PENGELUARAN'} - ${categoryInfo.name.toUpperCase()}`;
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.mergeCells('A2:F2');
        worksheet.getCell('A2').value = `Periode: ${monthNames[month - 1]} ${year}`;
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        worksheet.addRow([]);
        worksheet.addRow(['No', 'Tanggal', 'Nama Donatur', 'Keterangan', 'Nominal (¥)', 'Admin Input']);

        let total = 0;
        transactions.forEach((trx, index) => {
            let amountNum = Number(trx.amount) || 0;
            total += amountNum;
            worksheet.addRow([index + 1, new Date(trx.date).toLocaleDateString('id-ID'), trx.donor_name || '-', trx.description || '-', amountNum, trx.admin_name || '-']);
        });
        worksheet.addRow([]);
        worksheet.addRow(['', '', '', 'TOTAL', total, '']);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Laporan_${categoryInfo.name}_${monthNames[month - 1]}_${year}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.send("Gagal export Excel");
    }
});

// --- HALAMAN MONITORING DANA ---
router.get('/funds-monitoring', requireLogin, async (req, res) => {
    try {
        // Zakat
        const [zakatInRows] = await db.query(`
            SELECT SUM(amount) as total FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE c.name = 'Zakat'
        `);
        const zakatIn = Number(zakatInRows[0]?.total) || 0;
        const [zakatOutRows] = await db.query(`
            SELECT SUM(amount) as total FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE c.name = 'Pengeluaran Zakat'
        `);
        const zakatOut = Number(zakatOutRows[0]?.total) || 0;

        // Wakaf
        const [wakafInRows] = await db.query(`
            SELECT SUM(amount) as total FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE c.name = 'Wakaf'
        `);
        const wakafIn = Number(wakafInRows[0]?.total) || 0;
        const [wakafOutRows] = await db.query(`
            SELECT SUM(amount) as total FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE c.name = 'Pembangunan Masjid'
        `);
        const wakafOut = Number(wakafOutRows[0]?.total) || 0;

        // Operasional
        const [opsInRows] = await db.query(`
            SELECT SUM(amount) as total FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE c.name IN ('Sedekah/Infaq', 'Usaha Masjid')
        `);
        const opsIn = Number(opsInRows[0]?.total) || 0;
        const [opsOutRows] = await db.query(`
            SELECT SUM(amount) as total FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE c.name IN ('Listrik', 'Air', 'Gas', 'Pajak', 'Kegiatan Agama', 'Lainnya', 'Parkir')
        `);
        const opsOut = Number(opsOutRows[0]?.total) || 0;

        res.render('fundsMonitoring', {
            user: req.session,
            zakat: { in: zakatIn, out: zakatOut, balance: zakatIn - zakatOut },
            wakaf: { in: wakafIn, out: wakafOut, balance: wakafIn - wakafOut },
            operational: { in: opsIn, out: opsOut, balance: opsIn - opsOut }
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading funds monitoring");
    }
});

// --- CETAK LAPORAN KONSOLIDASI (PDF) ---
router.get('/report/print-monthly-funds', requireLogin, async (req, res) => {
    try {
        const { month, year } = req.query;
        // Helper query dengan parameter
        const getFundData = async (inCategories, outCategories) => {
            // inCategories dan outCategories adalah array, kita gunakan ANY
            const [inRows] = await db.query(`
                SELECT SUM(amount) as total FROM transactions t 
                JOIN categories c ON t.category_id = c.id 
                WHERE c.name = ANY($1::text[]) 
                  AND EXTRACT(MONTH FROM t.date) = $2 
                  AND EXTRACT(YEAR FROM t.date) = $3
            `, [inCategories, month, year]);
            const inTotal = Number(inRows[0]?.total) || 0;
            const [outRows] = await db.query(`
                SELECT SUM(amount) as total FROM transactions t 
                JOIN categories c ON t.category_id = c.id 
                WHERE c.name = ANY($1::text[]) 
                  AND EXTRACT(MONTH FROM t.date) = $2 
                  AND EXTRACT(YEAR FROM t.date) = $3
            `, [outCategories, month, year]);
            const outTotal = Number(outRows[0]?.total) || 0;
            return { in: inTotal, out: outTotal, balance: inTotal - outTotal };
        };

        const zakat = await getFundData(['Zakat'], ['Pengeluaran Zakat']);
        const wakaf = await getFundData(['Wakaf'], ['Pembangunan Masjid']);
        const operational = await getFundData(
            ['Sedekah/Infaq', 'Usaha Masjid'],
            ['Listrik', 'Air', 'Gas', 'Pajak', 'Kegiatan Agama', 'Lainnya', 'Parkir']
        );

        const aggregate = {
            totalInMonth: zakat.in + wakaf.in + operational.in,
            totalOutMonth: zakat.out + wakaf.out + operational.out,
            totalBalance: zakat.balance + wakaf.balance + operational.balance
        };

        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

        res.render('printMonthlyFunds', {
            user: req.session, month: monthNames[month - 1], year: year,
            zakat, wakaf, operational, aggregate, printMode: true
        });
    } catch (err) {
        console.error(err);
        res.send("Error generating report");
    }
});

module.exports = router;