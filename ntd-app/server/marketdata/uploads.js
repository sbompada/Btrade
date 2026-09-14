import { db } from '../db.js';

const presentUpload = (row) => ({
  id: row.id,
  filename: row.filename,
  fileType: row.file_type,
  totalRows: row.total_rows,
  importedRows: row.imported_rows,
  activeRows: row.active_rows ?? 0,
  duplicateRows: row.duplicate_rows,
  rejectedRows: row.rejected_rows,
  uploadedBy: row.uploaded_by_client_id,
  uploadedAt: row.uploaded_at,
});

export function listMarketImports() {
  const uploads = db.prepare(`
    SELECT u.*, users.client_id AS uploaded_by_client_id,
           COALESCE(SUM(d.imported_rows - d.deleted_rows), 0) AS active_rows
    FROM market_uploads u
    JOIN users ON users.id = u.uploaded_by
    LEFT JOIN market_upload_days d ON d.upload_id = u.id
    GROUP BY u.id
    ORDER BY u.id DESC
    LIMIT 50
  `).all().map(presentUpload);

  const days = db.prepare(`
    SELECT trading_date, SUM(imported_rows - deleted_rows) AS row_count,
           COUNT(DISTINCT upload_id) AS upload_count
    FROM market_upload_days
    GROUP BY trading_date
    HAVING row_count > 0
    ORDER BY trading_date DESC
  `).all().map((row) => ({
    tradingDate: row.trading_date,
    rowCount: row.row_count,
    uploadCount: row.upload_count,
  }));

  return { uploads, days };
}

export function storeMarketImport({ filename, fileType, parsed, userId }) {
  const insertUpload = db.prepare(`
    INSERT INTO market_uploads
      (filename, file_type, total_rows, imported_rows, duplicate_rows, rejected_rows, uploaded_by)
    VALUES (?, ?, ?, 0, 0, ?, ?)
  `);
  const insertCandle = db.prepare(`
    INSERT OR IGNORE INTO candles (symbol, interval, bucket, open, high, low, close, upload_id)
    VALUES (?, '1d', ?, ?, ?, ?, ?, ?)
  `);
  const insertDay = db.prepare(`
    INSERT INTO market_upload_days (upload_id, trading_date, imported_rows)
    VALUES (?, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    const upload = insertUpload.run(filename, fileType, parsed.totalRows, parsed.rejectedRows, userId);
    const uploadId = Number(upload.lastInsertRowid);
    const dayCounts = new Map();
    let importedRows = 0;

    for (const row of parsed.rows) {
      const result = insertCandle.run(row.symbol, row.date, row.open, row.high, row.low, row.close, uploadId);
      if (!result.changes) continue;
      importedRows += 1;
      dayCounts.set(row.date, (dayCounts.get(row.date) ?? 0) + 1);
    }

    for (const [date, count] of dayCounts) insertDay.run(uploadId, date, count);
    const duplicateRows = parsed.rows.length - importedRows;
    db.prepare('UPDATE market_uploads SET imported_rows = ?, duplicate_rows = ? WHERE id = ?')
      .run(importedRows, duplicateRows, uploadId);
    db.exec('COMMIT');

    return listMarketImports().uploads.find((item) => item.id === uploadId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteImportedDay(tradingDate) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const batchCounts = db.prepare(`
      SELECT upload_id, COUNT(*) AS row_count
      FROM candles
      WHERE interval = '1d' AND bucket = ? AND upload_id IS NOT NULL
      GROUP BY upload_id
    `).all(tradingDate);
    const deletedRows = batchCounts.reduce((total, row) => total + row.row_count, 0);

    if (deletedRows) {
      db.prepare("DELETE FROM candles WHERE interval = '1d' AND bucket = ? AND upload_id IS NOT NULL")
        .run(tradingDate);
      const updateDay = db.prepare(`
        UPDATE market_upload_days
        SET deleted_rows = min(imported_rows, deleted_rows + ?)
        WHERE upload_id = ? AND trading_date = ?
      `);
      for (const row of batchCounts) updateDay.run(row.row_count, row.upload_id, tradingDate);
    }
    db.exec('COMMIT');
    return deletedRows;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}